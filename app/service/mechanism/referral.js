'use strict';
const moment = require('moment');
const Service = require('egg').Service;
/*
  推荐机制分账适用范围：
  1. 投资人裂变quota满足后，将获得推荐机制奖励
  2. 购买人只能获得推荐机制奖励

  推荐机制分账公式：
  上家获得的金额：referral_bonus = amount * referral_rate
  作者获得的金额：amount - referral_bonus
*/
class ReferralService extends Service {

  // 行为相关者: 作者、付费人、推荐人
  async divide(payment, post, conn, assetTypes) {
    this.ctx.logger.info('ReferralService.divide start. %j', payment);

    let amount = payment.amount;
    const refuid = payment.referreruid; // 推荐人
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    // 推荐返利额，referral_rate：推荐返利比率
    const referral_bonus = amount * post.referral_rate / 100;

    // 1. 记录当前用户资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
      [ payment.uid, payment.signid, payment.contract, payment.symbol, 0 - payment.amount, payment.platform,
        assetTypes.payerAssetType, // 'support expenses'
        now ] // todo：type 重新定义
    );

    // 2. 更新推荐人资产余额
    await conn.query('INSERT INTO assets(uid, contract, symbol, amount, platform) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
      [ refuid, payment.contract, payment.symbol, referral_bonus, payment.platform, referral_bonus ]
    );
    // 记录推荐人资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
      [ refuid, payment.signid, payment.contract, payment.symbol, referral_bonus, payment.platform,
        assetTypes.referrerAssetType, // 'share income'
        now ] // todo：type 重新定义
    );

    // 3. 更新作者资产余额
    amount -= referral_bonus; // 剩余的金额
    await conn.query(
      'INSERT INTO assets(uid, contract, symbol, amount, platform) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
      [ post.uid, payment.contract, payment.symbol, amount, payment.platform, amount ]
    );
    // 记录作者资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
      [ post.uid, payment.signid, payment.contract, payment.symbol, amount, payment.platform,
        assetTypes.authorAssetType, // 'sign income'
        now ]
    );

    this.ctx.logger.info('ReferralService.divide end.');
  }

}

module.exports = ReferralService;
