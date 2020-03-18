'use strict';

const Controller = require('../../core/base_controller');

/**
 * @todo 都是坑
 */
class AccountBindController extends Controller {
  async GetMyPlatform() {
    const { ctx } = this;
    const { id, platform } = ctx.params;
    this.logger.info('GetMyPlatform', 'User Id in ctx ', ctx.user.id);
    if (ctx.user.id !== Number(id)) { // 登录ID和操作对象ID不一致，为非法操作
      ctx.body = ctx.msg.failure;
      return;
    }
    const result = await this.service.account.bind.getUserBindAtPlatform({ id }, platform);
    if (result && result.platform_id) {
      // 已经授权了，返回状态
      this.logger.info('GetMyPlatform', 'already bind at platform ' + platform);
      ctx.body = ctx.msg.success;
      ctx.body.isBind = true;
      ctx.body.data = result;
    } else {
      // 还没授权，生成ing
      this.logger.info('GetMyPlatform', 'not yet to bind at platform ' + platform);
      try {
        const result = await this.service.account.bind.generateBindingRequest({ id }, platform);
        ctx.logger.info('getMyBindcode success', result);
        ctx.body = ctx.msg.success;
        ctx.body.isBind = false;
        ctx.body.data = result;
      } catch (error) {
        ctx.logger.info('getMyBindcode failed');
        ctx.body = ctx.msg.failure;
        return;
      }
    }
  }

  /**
   * getMyBindStatus 获取某id的第三方平台绑定状态，公共接口，不能返回敏感数据
   */
  async getBindStatus() {
    const { ctx } = this;
    const { id } = ctx.params;
    const records = await this.app.mysql.select('user_third_party', { where: { uid: id }, limit: 10 });
    ctx.body = ctx.msg.success;
    const thirdParty = {};
    records.forEach(({ platform, platform_id }) => {
      // platform_id 可能是机密（不一定，钱包方面platform_id应该是是公钥，先暂时不开放这个字段）
      const isBind = Boolean(platform_id);
      // just wondering, maybe 未来 thirdParty 或许可以开放显示第三方平台的链接？
      thirdParty[platform] = { isBind };
    });
    ctx.body.data = thirdParty;
  }

  /**
   * 咚： 這是給 bot 收到後，轉交給後端用的？
   * Frank：我计划是留给作为 callback 使用，比如 OAuth 的callback应该调用
   * bot 方面，bot 直接连接网站数据库操作数据了
   */
  async setBindData() {
    const { ctx } = this;
    const { id, platform } = ctx.params;
    const { msgParams, publickey, sig } = ctx.params;
    const currentPlatformBinding = await this.app.mysql.get('user_third_party', { uid: id, platform });
    if (!currentPlatformBinding) { // 没有 Bindcode 记录
      ctx.body = ctx.msg.failure;
      return;
    }
    if (platform === 'telegram') {
      // 机器人自己会handle这个绑定关系，tg绑定后端只需要从后端拿授权码让用户操作就好
      ctx.body = ctx.msg.failure;
    } else if (platform === 'ethereum') {
      // @todo：验证以太坊签名信息即可
      this.service.account.bind.bindByEth(sig, msgParams, publickey);
    } else {
      // 未知平台
      ctx.body = ctx.msg.failure;
    }
  }
}

module.exports = AccountBindController;
