const Subscription = require('egg').Subscription;
const EOS = require('eosjs');
// const ONT = require('ontology-ts-sdk');
const moment = require('moment');
const axios = require('axios');

class ProcessWithdraw extends Subscription {

  constructor(ctx) {
    super(ctx);
    this.eosClient = EOS({
      broadcast: true,
      sign: true,
      chainId: ctx.app.config.eos.chainId,
      keyProvider: [ ctx.app.config.eos.withdraw_pri ],
      httpEndpoint: ctx.app.config.eos.httpEndpoint,
    });
  }

  static get schedule() {
    return {
      interval: '20s',
      type: 'worker',
    };
  }

  async subscribe() {
    if (this.ctx.app.config.isDebug) return;

    const results = await this.app.mysql.query('select * from assets_change_log where type=\'withdraw\' and status=0 limit 10');

    if (results.length === 0) { return; }

    for (let i = 0; i < results.length; i++) {
      const withdraw = results[i];

      const isLesshan10Min = moment(withdraw.create_time).add(10, 'm').isAfter(moment());
      if (isLesshan10Min) {
        this.logger.info(withdraw);
        console.log(withdraw);
        // return;
        if (withdraw.platform === 'eos') {
          await this.eos_transfer(withdraw);
        } else if (withdraw.platform === 'ont') {
          await this.ont_transfer(withdraw);
        }
      } else {
        await this.refund(withdraw);
      }
    }
  }

  async refund(withdraw) {
    this.logger.info('Refund withdraw', withdraw);
    console.log('Refund withdraw', withdraw);
    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.query(
        'INSERT INTO assets(uid, contract, symbol, amount, platform) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?',
        [ withdraw.uid, withdraw.contract, withdraw.symbol, withdraw.amount, withdraw.platform, withdraw.amount ]
      );

      await conn.update('assets_change_log', { status: 3 }, { where: { id: withdraw.id } });

      await conn.commit();
      this.logger.info('refund success');
      console.log('refund success');
    } catch (err) {
      await conn.rollback();
      this.ctx.logger.error(err);
    }
  }

  async eos_transfer(w) {
    this.logger.info('ProcessWithdraw EOS', w);
    console.log('ProcessWithdraw EOS', w);
    const conn = await this.app.mysql.beginTransaction();

    try {
      const result = await conn.query('SELECT * FROM assets_change_log WHERE id=? and status=0 limit 1 FOR UPDATE;', [ w.id ]);

      let withdraw;
      if (result && result.length > 0) {
        withdraw = result[0];
      }

      this.logger.info('withdraw', withdraw, result);
      console.log('withdraw', withdraw, result);

      if (!withdraw) {
        return;
      }

      await conn.update('assets_change_log', {
        status: 1,
      }, { where: { id: withdraw.id } });

      const actions = [{
        account: withdraw.contract,
        name: 'transfer',
        authorization: [{ actor: this.ctx.app.config.eos.withdraw_account, permission: 'active' }],
        data: {
          from: this.ctx.app.config.eos.withdraw_account,
          to: withdraw.toaddress,
          quantity: `${(withdraw.amount / 10000).toFixed(4)} ${withdraw.symbol}`,
          memo: withdraw.memo || '',
        },
      }];
      this.logger.info('actions:', actions);
      console.log('actions:', actions);

      const res = await this.eosClient.transaction({
        actions,
      });

      const trx = res.transaction_id;

      await conn.update('assets_change_log', {
        status: 1,
        trx,
      }, { where: { id: withdraw.id } });

      this.logger.info('eos transfer success');
      console.log('eos transfer success');

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      this.ctx.logger.error(err);
    }

  }

  async ont_transfer(w) {

    /*
    const conn = await this.app.mysql.beginTransaction();
    try {
      const result = await conn.query('SELECT * FROM assets_change_log WHERE id=? and status=0 limit 1 FOR UPDATE;', [ w.id ]);

      let withdraw;
      if (result && result.length > 0) {
        withdraw = result[0];
      }

      this.logger.info('withdraw', withdraw, result);
      console.log('withdraw', withdraw, result);

      if (!withdraw) {
        return;
      }

      await conn.update('assets_change_log', {
        status: 1,
      }, { where: { id: withdraw.id } });

      const gasLimit = '20000';
      const gasPrice = '500';

      const private_key_hex = this.ctx.app.config.ont.withdraw_pri;
      const publickey_address = this.ctx.app.config.ont.withdraw_account;

      const fromPrivateKey = new ONT.Crypto.PrivateKey(private_key_hex);

      const from = new ONT.Crypto.Address(publickey_address);
      const to = new ONT.Crypto.Address(withdraw.toaddress);

      const tx = ONT.OntAssetTxBuilder.makeTransferTx('ONT', from, to, withdraw.amount / 10000, gasPrice, gasLimit);

      // tx.payer = from;
      ONT.TransactionBuilder.signTransaction(tx, fromPrivateKey);

      // we can use RestClient, RpcClient or WebsocketClient to send the trasanction
      const socketClient = new ONT.WebsocketClient(this.ctx.app.config.ont.websocketClient);
      const response = await socketClient.sendRawTransaction(tx.serialize(), false, true);
      if (response && response.Desc == 'SUCCESS' && response.Result) {
        const trx = response.Result.TxHash;
        this.logger.info('ont transfer success', trx);
        console.log('ont transfer success', trx);
        const result = await conn.update('assets_change_log', {
          status: 1,
          trx,
        }, { where: { id: withdraw.id } });

        await conn.commit();
      } else {
        await conn.rollback();
      }

    } catch (err) {
      await conn.rollback();
      this.ctx.logger.error('process ont withdraw error ', err);
    }
  */
  }


}

module.exports = ProcessWithdraw;
