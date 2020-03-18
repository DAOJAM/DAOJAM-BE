const { Subscription } = require('egg');

class KeepWalletBalanceDaily extends Subscription {
  static get schedule() {
    return {
      cron: '0 0 2 * * *',
      type: 'worker',
    };
  }

  async subscribe() {
    // 先暂时关掉
    return;
    const { web3 } = this.service.ethereum.web3;
    const lowestBalanceLimit = web3.utils.toWei('0.0015', 'ether');
    const needAirdropList = await this.service.ethereum
      .etherBalance.getUnderBalanceWallet(lowestBalanceLimit);
    this.logger.info('KeepWalletBalanceDaily::needAirdropList', needAirdropList);
    if (needAirdropList.length !== 0) {
      const txHash = await this.service.ethereum.etherAirdrop.batchAirdropEther(
        needAirdropList,
        Array(needAirdropList.length).fill(web3.utils.toWei('0.002', 'ether')));
      await this.service.serverchan.sendNotification(
        '每日空投报告', `交易哈希 ${txHash}`);
    }
  }
}

module.exports = KeepWalletBalanceDaily;
