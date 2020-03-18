const { Subscription } = require('egg');
const axios = require('axios');

/**
 * Check Tx Status @author Frank Wei<frank@frankwei.xyz>
 * 功能：这个定时任务会时不时查询数据库 `assets_minetokens_log`表里的交易，
 * 并在区块链中查询交易的状态，并更新数据库。
 * 这是为了保证链上链下数据同步的一部分工作
 */
const txStatusCode = {
  FAIL: -1,
  PENDING: 0,
  OK: 1,
};
class SyncMinetokenTransaction extends Subscription {
  static get schedule() {
    return {
      interval: '1m',
      type: 'worker',
      immediate: true,
    };
  }

  async subscribe() {
    // 先暂时关掉
    return;
    if (this.ctx.app.config.isDebug) return;
    this.logger.info('Running SyncMinetokenTransaction at: ', new Date().toLocaleString());
    const { mysql } = this.ctx.app;
    const txsToBeMonitored = await mysql.query(
      'select DISTINCT tx_hash from assets_minetokens_log where on_chain_tx_status=? and tx_hash is not null',
      [ txStatusCode.PENDING ]
    );
    if (!txsToBeMonitored || txsToBeMonitored.length === 0) {
      return; // 没有 pending 的交易啊，那没事了
    }
    this.logger.info('txs to be monitored: ', txsToBeMonitored);

    // 开始查询交易小票
    const receipts = await Promise.all(txsToBeMonitored
      .map(tx => this.service.ethereum.web3.getTransactionReceipt(tx.tx_hash))
    );

    await Promise.all(receipts.map(receipt => {
      // receipt 为 null （交易未结束）时，直接跳过, 让他继续为 0
      if (!receipt) { return null; }
      const on_chain_tx_status = receipt.status ? txStatusCode.OK : txStatusCode.FAIL;
      if (!receipt.status) {
        this.service.serverchan.sendNotification(
          '以太坊交易被EVM回滚',
          `交易详细: \n ${JSON.stringify(receipt)
          }`)
          .then(() => { this.logger.info(`Reported tx: ${receipt.transactionHash} to serverchan`); })
          .catch(e => this.logger.error(e));
      }
      return mysql.update('assets_minetokens_log', {
        on_chain_tx_status,
      }, {
        where: { tx_hash: receipt.transactionHash },
      });
    }));
  }

}


module.exports = SyncMinetokenTransaction;
