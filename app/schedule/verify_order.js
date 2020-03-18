const Subscription = require('egg').Subscription;
const EOS = require('eosjs');
// const ONT = require('ontology-ts-sdk');
const moment = require('moment');
const axios = require('axios');
const consts = require('../service/consts');

class VerifyOrder extends Subscription {

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

    const expire = moment().subtract(12, 'hours').format('YYYY-MM-DD HH:mm:ss');

    const results = await this.app.mysql.query(`select * from orders where status=0 and create_time>'${expire}' limit 10`);
    // this.logger.info(results);
    // console.log(results);
    if (results.length === 0) { return; }

    for (let i = 0; i < results.length; i++) {
      const order = results[i];
      if (order.platform === 'eos') {
        await this.eos_verify(order);
      } else if (order.platform === 'ont') {
        await this.ont_verify(order);
      } else if (order.platform === 'vnt') {
        await this.vnt_verify(order);
      }
    }
  }

  async eos_verify(order) {
    const user = await this.service.account.binding.get2({ id: order.uid });
    // const user = await this.app.mysql.get('users', { id: order.uid });

    // 根据 signid 去合约中取 table row，Limit 为username
    // 取到则继续验证 amount， contract ，symbol， referrer， 验证通过才进入结算
    try {
      const result = await this.eosClient.getTableRows({
        json: 'true',
        code: this.ctx.app.config.eos.contract,
        scope: user.username,
        table: 'orders',
        limit: 1,
        lower_bound: order.id,
      });

      if (result && result.rows && result.rows.length > 0) {
        const row = result.rows[0];

        let verifyPass = false;

        let reffer_name = '';
        if (order.referreruid > 0) {
          const reffer = await this.service.account.binding.get2({ id: order.referreruid });
          // const reffer = await this.app.mysql.get('users', { id: order.referreruid });
          reffer_name = reffer ? reffer.username : '';
        }

        let contract_ref = row.ref;
        if (contract_ref === 'null') {
          contract_ref = '';
        }

        const strs = row.amount.split(' ');
        const amount = parseFloat(strs[0]) * 10000; // todo: 10000 = 10 ** order.decimals
        const symbol = strs[1];

        if (row.contract === order.contract
          && row.user === user.username
          && symbol === order.symbol
          && amount === order.amount
          && contract_ref === reffer_name
        ) {
          verifyPass = true;
        }

        this.logger.info('user,', user);
        console.log('user,', user);
        // this.logger.info('reffer,', reffer);
        // console.log('reffer,', reffer);
        this.logger.info('contract,', row);
        console.log('contract,', row);
        this.logger.info('mysql', order);
        console.log('mysql', order);
        this.logger.info('verifyPass', verifyPass);
        console.log('verifyPass', verifyPass);

        if (verifyPass) {
          await this.passVerify(order);
        }

      } else {
        this.logger.info('table row not found');
        console.log('table row not found');
      }

    } catch (err) {
      this.logger.error('get table row err', err);
      console.log('get table row err', err);
    }

  }

  async ont_verify(order) {
    /*
    // https://dev-docs.ont.io/#/docs-cn/ontology-cli/05-rpc-specification?id=getstorage
    // 根据本体文档说明 取合约中的值，需要传入两个参数： hex_contract_address：以十六进制字符串表示智能合约哈希地址 key：以十六进制字符串表示的存储键值
    // 所以，key 就用 （signId + uid or user address ）的 hex , 对应的value， 和eos版本类似，存储 转账代币合约、数量、符号，推荐人，供这里做二次验证和数据库中是否相符合。

    // 做本体合约数据验证
    const scriptHash = '36df9722fc0ff5fa3979f2a844a012cabe1d4c56'; // this.ctx.app.config.ont.scriptHash;
    const httpEndpoint = this.ctx.app.config.ont.httpEndpoint;

    const sponsor = await this.app.mysql.get('users', { id: order.uid });

    // let key_origin = `${sponsor.username}${order.signid}`;
    // let keyhex = "01" + Buffer.from(key_origin).toString('hex');
    const oid = `oId:${order.id}`;
    const key_origin = `${sponsor.username}${oid + ''}`;
    const keyhex = '01' + Buffer.from(key_origin).toString('hex');

    const { data } = await axios.get(`${httpEndpoint}/api/v1/storage/${scriptHash}/${keyhex}`);
    if (data && data.Result) {
      // console.log(key_origin)
      // console.log(keyhex)
      // console.log(data)

      const ontMap = ONT.ScriptBuilder.deserializeItem(new ONT.utils.StringReader(data.Result));
      const entries = ontMap.entries();
      let obj = entries.next();
      const row = {};

      try {
        while (!obj.done) {
          const key = obj.value[0];
          let value = obj.value[1];
          if (typeof value === 'string') {
            value = ONT.utils.hexstr2str(value);
          }
          row[key] = value;
          obj = entries.next();
        }
      } catch (err) {
        console.error(err);
      }

      let reffer = 0;
      if (order.referreruid !== 0) {
        const user = await this.app.mysql.get('users', { id: order.referreruid });
        if (user) {
          reffer = user.username;
        }
      }

      const verifyPass = (
        row.contract === order.contract
        && row.symbol === order.symbol
        && parseInt(row.amount2) * 10000 === order.amount // todo: 10000 = 10 ** order.decimals
        && row.sponsor === reffer
      );

      this.logger.info('contract,', row);
      console.log('contract,', row);
      this.logger.info('mysql', order);
      console.log('mysql', order);
      this.logger.info('verifyPass', verifyPass);
      console.log('verifyPass', verifyPass);

      if (verifyPass) {
        await this.passVerify(order);
      }

    }
    */
  }

  async vnt_verify(order) {
    order.action = consts.payActions.buy;
    const result = await this.service.vnt.verify(order);
    if (result) {
      await this.passVerify(order);
    }
  }

  async passVerify(order) {
    order.action = consts.payActions.buy;
    await this.service.mechanism.payContext.handling(order);
  }

}

module.exports = VerifyOrder;
