const Subscription = require('egg').Subscription;
const EOS = require('eosjs');
// const ONT = require('ontology-ts-sdk');
const moment = require('moment');
const axios = require('axios');
const consts = require('../service/consts');

class VerifySupport extends Subscription {

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

    const expire = moment().subtract(1, 'hours').format('YYYY-MM-DD HH:mm:ss');

    const results = await this.app.mysql.query(`select * from supports where status=0 and create_time>'${expire}' limit 10`);

    if (results.length === 0) {
      return;
    }

    for (let i = 0; i < results.length; i++) {
      const support = results[i];
      if (support.platform === 'eos') {
        await this.eos_verify(support);
      } else if (support.platform === 'ont') {
        await this.ont_verify(support);
      } else if (support.platform === 'vnt') {
        await this.vnt_verify(support);
      }
    }
  }

  async eos_verify(support) {

    // 根据 signid 去合约中取 table row，Limit 为username， 取到则继续验证 amount， contract ，symbol， referrer， 验证通过才进入结算
    const user = await this.service.account.binding.get2({ id: support.uid });
    // const user = await this.app.mysql.get('users', { id: support.uid });

    try {
      const result = await this.eosClient.getTableRows({
        json: 'true',
        code: this.ctx.app.config.eos.contract,
        scope: support.signid,
        table: 'supports',
        limit: 1,
        lower_bound: user.username,
      });

      if (result && result.rows && result.rows.length > 0) {
        const row = result.rows[0];

        let verifyPass = false;

        const reffer = await this.service.account.binding.get2({ id: support.referreruid });
        // const reffer = await this.app.mysql.get('users', { id: support.referreruid });
        const reffer_name = reffer ? reffer.username : '';

        let contract_ref = row.ref;
        if (contract_ref == 'null') {
          contract_ref = '';
        }

        const strs = row.amount.split(' ');
        const amount = parseFloat(strs[0]) * 10000;
        const symbol = strs[1];

        if (row.contract === support.contract
          && row.user === user.username
          && symbol === support.symbol
          && amount === support.amount
          && contract_ref === reffer_name
        ) {
          verifyPass = true;
        }

        this.logger.info('user,', user);
        console.log('user,', user);
        this.logger.info('reffer,', reffer);
        console.log('reffer,', reffer);
        this.logger.info('contract,', row);
        console.log('contract,', row);
        this.logger.info('mysql', support);
        console.log('mysql', support);
        this.logger.info('verifyPass', verifyPass);
        console.log('verifyPass', verifyPass);

        if (verifyPass) {
          await this.passVerify(support);
        }

      } else {
        this.logger.info('table row not found');
        console.log('table row not found');
      }

    } catch (err) {
      this.logger.error('get table row err');
      console.log('get table row err');
    }

  }

  async ont_verify(support) {
    /*
    // https://dev-docs.ont.io/#/docs-cn/ontology-cli/05-rpc-specification?id=getstorage
    // 根据本体文档说明 取合约中的值，需要传入两个参数： hex_contract_address：以十六进制字符串表示智能合约哈希地址 key：以十六进制字符串表示的存储键值
    // 所以，key 就用 （signId + uid or user address ）的 hex , 对应的value， 和eos版本类似，存储 转账代币合约、数量、符号，推荐人，供这里做二次验证和数据库中是否相符合。
    this.logger.info('ont_verify ');
    console.log('ont_verify ');

    // 做本体合约数据验证
    const scriptHash = '36df9722fc0ff5fa3979f2a844a012cabe1d4c56'; // this.ctx.app.config.ont.scriptHash;
    const httpEndpoint = this.ctx.app.config.ont.httpEndpoint;

    const sponsor = await this.app.mysql.get('users', { id: support.uid });

    // let key_origin = `${sponsor.username}${support.signid}`;
    // let keyhex = "01" + Buffer.from(key_origin).toString('hex');

    const key_origin = `${sponsor.username}${support.signid + ''}`;
    const keyhex = '01' + Buffer.from(key_origin).toString('hex');

    const response = await axios.get(`${httpEndpoint}/api/v1/storage/${scriptHash}/${keyhex}`);


    if (response.data && response.data.Result) {
      // console.log(key_origin)
      // console.log(keyhex)
      // console.log(response.data)

      const ontMap = ONT.ScriptBuilder.deserializeItem(new ONT.utils.StringReader(response.data.Result));
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
        this.logger.error(err);
        console.log(err);
      }

      let reffer = 0;
      if (support.referreruid !== 0) {
        const user = await this.app.mysql.get('users', { id: support.referreruid });
        if (user) {
          reffer = user.username;
        }
      }

      const verifyPass = (
        row.contract === support.contract
        && row.symbol === support.symbol
        && parseInt(row.amount2) === (support.amount / 10000)
        && row.sponsor === reffer
      );

      this.logger.info('contract,', row);
      console.log('contract,', row);
      this.logger.info('mysql', support);
      console.log('mysql', support);
      this.logger.info('verifyPass', verifyPass);
      console.log('verifyPass', verifyPass);

      if (verifyPass) {
        await this.passVerify(support);
      }

    }
  */
  }

  async vnt_verify(support) {
    support.action = consts.payActions.support;
    const result = await this.service.vnt.verify(support);
    if (result) {
      await this.passVerify(support);
    }
  }

  async passVerify(support) {
    support.action = consts.payActions.support;
    this.service.mechanism.payContext.handling(support);
  }

}

module.exports = VerifySupport;
