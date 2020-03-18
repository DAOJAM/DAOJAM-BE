'use strict';
const consts = require('../consts');
const moment = require('moment');
const Service = require('egg').Service;

class PayContextService extends Service {

  async test() {
    const expire = moment().subtract(24, 'hours').format('YYYY-MM-DD HH:mm:ss');

    const results = await this.app.mysql.query(`select * from orders where status=0 and create_time>'${expire}' limit 10`);
    this.logger.info(results);
    console.log(results);
    if (results.length === 0) { return; }

    const order = results[0];
    order.action = consts.payActions.buy;
    await this.service.mechanism.payContext.handling(order);
  }

  async handling(payment) {
    this.ctx.logger.info('PayContextService.handling start. %j', payment);

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 1. 检查文章是否存在
      const post = await this.app.mysql.get('posts', { id: payment.signid });
      if (!post) {
        return;
      }

      // 2. 把当前support/order改为已处理状态
      // 首先锁定数据，防止高并发
      let updateResult;
      if (payment.action === consts.payActions.support) {
        updateResult = await conn.query('UPDATE supports SET status=1 WHERE id=? AND status=0;', [ payment.id ]);
      } else {
        updateResult = await conn.query('UPDATE orders SET status=1 WHERE id=? AND status=0;', [ payment.id ]);
      }
      if (updateResult.affectedRows !== 1) {
        conn.rollback();
        return;
      }

      // todo：优化评论模块时在处理
      // const commentType = payment.action === consts.payActions.support ? consts.commentTypes.support : consts.commentTypes.order;
      // updateResult = await conn.query('UPDATE comments SET status=1 WHERE ref_id=? AND type=?;', [ payment.id, commentType ]);

      // 3. 开始分账
      /*
      - 有推荐人
        - 推荐人quota是否满了
          - 满了，走推荐返利分账
          - 未满，走裂变返利分账
      - 无推荐人，走普通分账
      */
      let referrer_result;

      let types;
      if (payment.action === consts.payActions.buy) {
        types = {
          payerAssetType: consts.assetTypes.buyExpenses,
          authorAssetType: consts.assetTypes.authorSaleIncome,
        };
      } else {
        types = {
          payerAssetType: consts.assetTypes.supportExpenses,
          authorAssetType: consts.assetTypes.authorSupportedIncome,
        };
      }

      // 有推荐人，（在提交order/support时已经判断是付费用户，并且前端/合约控制必须是同一个platform才能当推荐人）
      if (payment.referreruid > 0) {
        // 使用FOR UPDATE锁定推荐人的quota数据避免高并发问题
        referrer_result = await conn.query('SELECT id, quota FROM support_quota WHERE uid=? AND signid=? FOR UPDATE;',
          [ payment.referreruid, payment.signid ]
        );

        // 推荐人有quota并且未满，走裂变分账
        if (referrer_result && referrer_result.length > 0 && referrer_result[0].quota > 0) {
          types.referrerAssetType = consts.assetTypes.fissionIncome;
          await this.service.mechanism.fission.divide(payment, post, referrer_result[0], conn, types);
        } else {
          // 推荐人quota满了，或者没有quota，走推荐分账
          types.referrerAssetType = consts.assetTypes.referralIncome;
          await this.service.mechanism.referral.divide(payment, post, conn, types);
        }
      } else { // 没有推荐人，走普通分账
        await this.service.mechanism.general.divide(payment, post, conn, types);
      }

      // 4. 赞赏行为，添加赞赏者的裂变quota
      if (payment.action === consts.payActions.support) {
        await this.service.mechanism.fission.addQuota(payment, post, conn);
      }

      // 5. 购买行为，处理发货
      if (payment.action === consts.payActions.buy) {
        const is_shipped = await this.service.shop.order.shipped(post, payment, conn);
        if (!is_shipped) {
          await conn.rollback();
          this.logger.info(`发货失败，sign_id: ${post.id}, order_id: ${payment.id}`);
          console.log(`发货失败，sign_id: ${post.id}, order_id: ${payment.id}`);
          return;
        }
      }

      // 6. 更新count表统计数据
      let supportCount = 0;
      if (payment.action === consts.payActions.support) {
        supportCount = 1;
      }
      if (payment.platform === 'eos') {
        await conn.query(
          'INSERT INTO post_read_count(post_id, real_read_count, sale_count, support_count, eos_value_count, ont_value_count) VALUES (?, 0, 0, ?, ?, 0) '
          + 'ON DUPLICATE KEY UPDATE support_count = support_count + 1, eos_value_count = eos_value_count + ?;',
          [ payment.signid, supportCount, payment.amount, payment.amount ]
        );
      } else if (payment.platform === 'ont') {
        await conn.query(
          'INSERT INTO post_read_count(post_id, real_read_count, sale_count, support_count, eos_value_count, ont_value_count) VALUES (?, 0, 0, ?, 0, ?) '
          + 'ON DUPLICATE KEY UPDATE support_count = support_count + 1, ont_value_count = ont_value_count + ?;',
          [ payment.signid, supportCount, payment.amount, payment.amount ]
        );
      } else if (payment.platform === 'vnt') {
        await conn.query(
          'INSERT INTO post_read_count(post_id, real_read_count, sale_count, support_count, eos_value_count, vnt_value_count) VALUES (?, 0, 0, ?, 0, ?) '
          + 'ON DUPLICATE KEY UPDATE support_count = support_count + 1, vnt_value_count = vnt_value_count + ?;',
          [ payment.signid, supportCount, payment.amount, payment.amount ]
        );
      }

      // 提交事务
      await conn.commit();

      // 另行处理邮件发送..
      if (payment.action === consts.payActions.buy) {
        this.logger.info('MailService:: sendMail :是商品, 准备发送邮件' + payment.id);
        if (this.ctx.app.config.mailSetting) {
          const mail = await this.service.mail.sendMail(payment.id);
          if (mail) {
            this.logger.info('MailService:: sendMail success: supportid: ' + payment.id);
          } else {
            this.logger.error('MailService:: sendMail error: supportid: ' + payment.id);
          }
        }
      }

    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error('PayContextService.handling exception. %j', e);
    }

    this.ctx.logger.info('PayContextService.handling end. %j', payment);
  }

  async canBeReferrer(uid, signId) {
    const support = await this.service.support.getByUserId(uid, signId);
    if (support && support.id > 0) {
      return true;
    }

    const order = await this.service.shop.order.getByUserId(uid, signId);
    if (order && order.id > 0) {
      return true;
    }

    return false;
  }

}

module.exports = PayContextService;
