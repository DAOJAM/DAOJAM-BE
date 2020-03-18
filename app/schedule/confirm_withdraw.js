const Subscription = require('egg').Subscription;
const EOS = require('eosjs');
// const ONT = require('ontology-ts-sdk');
const moment = require('moment');
const axios = require('axios');

class ConfirmWithdraw extends Subscription {

  constructor(ctx) {
    super(ctx);
    this.eosClient = EOS({
      broadcast: true,
      sign: true,
      chainId: ctx.app.config.eos.chainId,
      keyProvider: [ ctx.app.config.eos.keyProvider ],
      httpEndpoint: ctx.app.config.eos.httpEndpoint,
    });
  }

  static get schedule() {
    return {
      interval: '5s',
      type: 'worker',
    };
  }

  async subscribe() {
    if (this.ctx.app.config.isDebug) return;
    const results = await this.app.mysql.query('select * from assets_change_log where type=\'withdraw\' and status=1 limit 10');

    if (results.length === 0) { return; }

    for (let i = 0; i < results.length; i++) {
      const withdraw = results[i];

      const isLesshan60Min = moment(withdraw.create_time).add(60, 'm').isAfter(moment());

      if (isLesshan60Min) {
        if (withdraw.platform === 'eos') {
          await this.eos_trx_confirm(withdraw);
        } else if (withdraw.platform === 'ont') {
          await this.ont_trx_confirm(withdraw);
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

  async eos_trx_confirm(withdraw) {
    try {
      const trx = await this.eosClient.getTransaction(withdraw.trx);

      const block_num = trx.block_num;
      const last_irreversible_block = trx.last_irreversible_block;

      if (last_irreversible_block >= block_num && trx.trx.receipt.status == 'executed') {
        this.logger.info('交易已确认', last_irreversible_block - block_num, trx.trx.receipt.status);
        console.log('交易已确认', last_irreversible_block - block_num, trx.trx.receipt.status);
        await this.do_confirm(withdraw);
      } else {
        this.logger.info('交易未确认', last_irreversible_block - block_num, trx.trx.receipt.status);
        console.log('交易未确认', last_irreversible_block - block_num, trx.trx.receipt.status);
      }
    } catch (err) {
      this.ctx.logger.error(err);
    }
  }

  async ont_trx_confirm(withdraw) {
    // 查询hash
    // http://polaris1.ont.io:20334/api/v1/transaction/a3dcb01d71eed20be5921cd85ac5448247b170c78c88545625ab0a240cb1c4ed?raw=0
    const response = await axios.get(`${this.ctx.app.config.ont.httpEndpoint}/api/v1/transaction/${withdraw.trx}?raw=0}`);

    if (response && response.data && response.data.Result) {
      const data = response.data;
      if (data.Desc === 'SUCCESS' && data.Error === 0) {
        const result = data.Result;
        if (result.Payer === this.ctx.app.config.ont.withdraw_account && result.Hash === withdraw.trx) {
          this.logger.info('交易已确认', withdraw);
          console.log('交易已确认', withdraw);
          await this.do_confirm(withdraw);
          return;
        }
      }
    }
    this.logger.info('交易未确认', withdraw);
    console.log('交易未确认', withdraw);
  }

  async do_confirm(withdraw) {
    try {
      await this.app.mysql.update('assets_change_log', {
        status: 2,
      }, { where: { id: withdraw.id } });

      // await this.app.mysql.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      //   [withdraw.uid, 0, withdraw.contract, withdraw.symbol, (0 - withdraw.amount), withdraw.platform, "withdraw", withdraw.create_time]
      // );

      this.logger.info('do_confirm transfer success');
      console.log('do_confirm transfer success');
    } catch (err) {
      this.ctx.logger.error(err);
    }

  }


}

module.exports = ConfirmWithdraw;
