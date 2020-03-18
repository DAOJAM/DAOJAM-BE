'use strict';

const Controller = require('../core/base_controller');

class DaothonController extends Controller {
  // 查询用户持仓token list
  async tokenList() {
    const ctx = this.ctx;
    const { pagesize = 10, page = 1, order = 0, userId } = this.ctx.query;
    // token list
    const result = await ctx.service.exchange.getTokenListByUser(userId, parseInt(page), parseInt(pagesize), parseInt(order));
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async userAddress() {
    const ctx = this.ctx;
    const { uid = 0 } = ctx.query;
    const res = await this.app.mysql.get('account_hosting', { uid });
    if (!res) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: res.public_key,
    };
  }
}

module.exports = DaothonController;
