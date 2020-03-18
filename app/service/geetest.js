'use strict';

const Service = require('egg').Service;
const Geetest = require('../geetest/gt-sdk');

class GeeTestService extends Service {
  constructor(ctx) {
    super(ctx);
    this.captcha = new Geetest({
      geetest_id: this.config.geetest.geetest_id,
      geetest_key: this.config.geetest.geetest_key,
    });
  }
  async validate(geetestObj) {
    try {
      const success = await this.captcha.validate(false, {
        geetest_challenge: geetestObj.geetest_challenge,
        geetest_validate: geetestObj.geetest_validate,
        geetest_seccode: geetestObj.geetest_seccode,
      });
      return success;
    } catch (e) {
      return false;
    }
  }
  async register() {
    return this.captcha.register(null);
  }
}

module.exports = GeeTestService;
