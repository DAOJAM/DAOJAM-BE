'use strict';

const Controller = require('egg').Controller;
// const Geetest = require('../geetest/gt-sdk');
const Geetest = require('gt3-sdk');

class GeetestController extends Controller {
  constructor(ctx) {
    super(ctx);
    this.captcha = new Geetest({
      geetest_id: this.config.geetest.geetest_id,
      geetest_key: this.config.geetest.geetest_key,
    });
  }
  // 请求geetest验证，获取验证参数
  async validate() {
    const ctx = this.ctx;
    const req = ctx.request;
    try {
      const success = await this.captcha.validate(false, {
        geetest_challenge: req.body.geetest_challenge,
        geetest_validate: req.body.geetest_validate,
        geetest_seccode: req.body.geetest_seccode,
      });
      if (!success) {
        // 二次验证失败
        ctx.body = { status: 'fail', info: '失败' };
      } else {
        ctx.body = { status: 'success', info: '成功' };
      }
    } catch (err) {
      ctx.body = { status: 'error', info: err };
    }
  }

  // 向极验申请每次验证所需的challenge
  async register() {
    const ctx = this.ctx;
    ctx.logger.info('geetest register');
    let data;
    try {
      data = await this.captcha.register(null);
      if (!data.success) {
        // req.session.fallback = true;
      } else {
        // req.session.fallback = false;
      }
      ctx.body = data;
    } catch (e) {
      ctx.status = 500;
      ctx.body = data;
    }
  }
}

module.exports = GeetestController;
