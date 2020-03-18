'use strict';

const Controller = require('../core/base_controller');

class WechatController extends Controller {

  // 获取签名
  async calculateSign() {
    const ctx = this.ctx;
    const { url = '' } = ctx.query;

    const wxSign = await this.service.wechat.getSign(url);

    if (!wxSign) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = wxSign;
  }
}

module.exports = WechatController;
