'use strict';
const Service = require('egg').Service;
const crypto = require('crypto');


class AccountBindingService extends Service {
  /**
   *
   * @param {object} user user object, must have `id`
   * @param {number} user.id user id
   * @param {string} platform target platform
   * @return {Promise<BindRecord>} 用户在 platform 的绑定记录
   */
  getUserBindAtPlatform({ id }, platform) {
    return this.app.mysql.get('user_third_party', { uid: id, platform });
  }
  /**
   * generateBindingRequest, 生成绑定的请求,每次调用都会重新生成 challengeText
   * @param {object} currentUser 当前用户对象
   * @param {object} currentUser.id 当前用户对象 ID
   * @param {string} platform 第三方帐户平台
   * @return {object} { uid, platform, challenge_text }
   */
  async generateBindingRequest({ id }, platform) {
    // 检测该用户有没有绑定这个 platform 的记录
    const request = await this.app.mysql.get('user_third_party', { uid: id, platform });
    if (request && request.platform_id) {
      throw Error('You have bind this platform already');
    } else {
      const challenge_text = crypto.randomBytes(23).toString('hex');
      try {
        await this.app.mysql.update('user_third_party', { challenge_text }, {
          where: { uid: id, platform },
        });
        return {
          platform,
          challenge_text,
        };
      } catch (error) {
        this.ctx.logger.error(error);
        throw error;
      }
    }
  }

  bindByEth(sig, msgParams, publickey) {
    // @todo: 仅仅做了设计，需要验证这个函数是不是正常工作
    const { uid, challenge_text } = msgParams.message;
    const isLegit = this.service.ethereum.signatureService.verifyAuth(sig, msgParams, publickey);
    if (!isLegit) throw Error('Invalid ETH Signature');
    else {
      return this._updateBind(uid, 'ethereum', publickey, challenge_text);
    }
  }

  /**
   * _updateBind 函数
   * 这个 _updateBind 应该不能被公开调用，调用前应该校验好数据
   * @param {number} uid 用户本站ID
   * @param {string} platform 第三方平台，应该为全小写
   * @param {string} platform_id 平台用户的ID
   * @param {string} challenge_text 验证码
   */
  async _updateBind(uid, platform, platform_id, challenge_text) {
    try {
      await this.app.mysql.update('user_third_party', { platform_id, challenge_text: null }, {
        where: { uid, platform, challenge_text },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

}

module.exports = AccountBindingService;
