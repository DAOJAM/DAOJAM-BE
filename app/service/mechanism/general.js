'use strict';
const moment = require('moment');
const Service = require('egg').Service;
/*
  普通机制分账适用范围：无推荐人

  普通分账公式：金额全部给作者
*/
class GeneralService extends Service {
  // 普通分账，行为相关者: 作者，付费人
  async divide(payment, post, conn, assetTypes) {
    this.ctx.logger.info('GeneralService.divide start. %j', payment);

    const now = moment().format('YYYY-MM-DD HH:mm:ss');

    // 1. 记录当前赞赏用户资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ payment.uid, payment.signid, payment.contract, payment.symbol, 0 - payment.amount, payment.platform,
        assetTypes.payerAssetType, // 'support expenses'
        now ]
    );

    // 2. 更新文章作者资产余额
    await conn.query(
      'INSERT INTO assets(uid, contract, symbol, amount, platform) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?',
      [ post.uid, payment.contract, payment.symbol, payment.amount, payment.platform, payment.amount ]
    );
    // 记录文章作者资产变动log
    await conn.query('INSERT INTO assets_change_log(uid, signid, contract, symbol, amount, platform, type, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ post.uid, payment.signid, payment.contract, payment.symbol, payment.amount, payment.platform,
        assetTypes.authorAssetType, // 'sign income'
        now ]
    );

    this.ctx.logger.info('GeneralService.divide end.');
  }
}

module.exports = GeneralService;
