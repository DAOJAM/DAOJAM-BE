'use strict';

const Controller = require('egg').Controller;

class AssetController extends Controller {
  // 查询当前用户CNY余额
  async getBalance() {
    const ctx = this.ctx;
    let { symbol } = ctx.query;
    if (!symbol) {
      symbol = 'CNY';
    }
    const balance = await this.ctx.service.assets.balanceOf(ctx.user.id, symbol);
    ctx.body = balance;
  }
  async transfer() {
    const ctx = this.ctx;
    const { symbol = 'cny', to, amount } = this.ctx.request.body;
    // amount 客户端*精度，10^decimals
    // 记录转赠cny常用候选列表
    await this.ctx.service.history.put('token', to);
    const result = await ctx.service.assets.transferFrom(symbol, ctx.user.id, to, amount);
    ctx.body = result ? ctx.msg.success : ctx.msg.failure;
  }
}

module.exports = AssetController;
