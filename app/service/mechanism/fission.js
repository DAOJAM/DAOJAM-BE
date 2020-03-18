'use strict';
const moment = require('moment');
const Service = require('egg').Service;
/*
  裂变机制分账适用范围：
  1. 赞赏或投资

  裂变机制分账公式：
  上家获得的金额：fission_bonus = amount * fission_rate
  作者获得的金额：amount - fission_bonus
  赞赏者获得的quota公式：quota = amount * fission_factor
*/
class FissionService extends Service {

  // 分账，行为相关者: 作者，付费人、推荐人
  async divide(payment, post, referrer_support_quota, conn, assetTypes) {
    this.ctx.logger.info('FissionService.divide start. %j', payment);

    let amount = payment.amount;
    const refuid = payment.referreruid;
    const now = moment().format('YYYY-MM-DD HH:mm:ss');


    // 1. 记录当前赞赏用户资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ payment.uid, payment.signid, payment.contract, payment.symbol, 0 - payment.amount, payment.platform,
        assetTypes.payerAssetType, // 'support expenses'
        now ]
    );


    // 2. 处理推荐人资产余额、资产变动log
    const fission_rate = post.fission_rate; // 裂变返利比率
    // 本次推荐人可以获得奖励金额：fission_bonus = amount * fission_rate，但不能大于剩余的quota
    const delta = referrer_support_quota.quota < amount * fission_rate / 100 ? referrer_support_quota.quota : amount * fission_rate / 100;

    // 更新推荐人资产余额
    await conn.query('INSERT INTO assets(uid, contract, symbol, amount, platform) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?',
      [ refuid, payment.contract, payment.symbol, delta, payment.platform, delta ]
    );
    // 记录推荐人资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ refuid, payment.signid, payment.contract, payment.symbol, delta, payment.platform,
        assetTypes.referrerAssetType, // 'share income'
        now ]
    );

    // 更新推荐人的quota
    let new_quota = referrer_support_quota.quota - delta;
    if (new_quota < 0) {
      new_quota = 0;
    }
    await conn.query('UPDATE support_quota SET quota = ? where id = ?',
      [ new_quota, referrer_support_quota.id ]
    );


    // 3. 更新文章作者资产余额
    amount -= delta; // 剩余的金额
    await conn.query(
      'INSERT INTO assets(uid, contract, symbol, amount, platform) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?',
      [ post.uid, payment.contract, payment.symbol, amount, payment.platform, amount ]
    );
    // 记录作者资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ post.uid, payment.signid, payment.contract, payment.symbol, amount, payment.platform,
        assetTypes.authorAssetType, // 'sign income'
        now ]
    );

    this.ctx.logger.info('FissionService.divide end.');
  }

  // 添加赞赏者的quota
  async addQuota(support, post, conn) {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const quota = support.amount * post.fission_factor / 1000;
    // 1. 记录当前赞赏用户的quota
    await conn.query('INSERT INTO support_quota(uid, signid, contract, symbol, quota, create_time) VALUES (?, ?, ?, ?, ?, ?)',
      [ support.uid, support.signid, support.contract, support.symbol, quota, now ]
    );
  }

}

module.exports = FissionService;
