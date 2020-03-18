'use strict';

const Controller = require('../core/base_controller');
const _ = require('lodash');
const consts = require('../service/consts');

class OrderController extends Controller {

  async create() {
    const { ctx } = this;
    const { signId, contract, symbol, amount, platform, num = 0, comment, referrer } = ctx.request.body;

    if (!signId) {
      this.logger.info('create order', signId);
      console.log('create order', signId);
      return this.response(403, 'signId required');
    }
    this.logger.info('create order');
    console.log('create order');
    if (!contract) {
      return this.response(403, 'contract required');
    }
    if (!symbol) {
      return this.response(403, 'symbol required');
    }
    if (!amount) {
      return this.response(403, 'amount required');
    }
    if (num === 0) {
      return this.response(403, 'num required');
    }
    if (!platform) {
      return this.response(403, 'platform required');
    }
    if (!(platform === 'eos' || platform === 'ont' || platform === 'vnt')) {
      return this.response(403, 'platform not support');
    }

    let referreruid = parseInt(referrer);
    if (isNaN(referreruid)) {
      referreruid = 0;
    }
    // 判断推荐人
    if (referreruid > 0) {
      // 不能是自己
      if (referreruid === this.ctx.user.id) {
        this.ctx.body = ctx.msg.referrerNoYourself;
        return;
      }

      // 判断是否可以当推荐人
      const flag = await this.service.mechanism.payContext.canBeReferrer(referreruid, signId);
      if (!flag) {
        this.ctx.body = ctx.msg.referrerNotExist;
        return;
      }
    }

    // const m = ctx.msg.get(1);
    const orderId = await this.service.shop.order.create(this.ctx.user.id, signId, contract, symbol, amount, platform, num, referreruid);

    // 失败
    if (orderId <= 0) {
      switch (orderId) {
        case -1:
          this.ctx.body = ctx.msg.postCannotBuy;
          break;
        case -2:
          this.ctx.body = ctx.msg.postPriceError;
          break;
        case -3:
          this.ctx.body = ctx.msg.failure;
          break;
        case -99:
          this.ctx.body = ctx.msg.serverError;
          break;
      }
      return;
    }

    // 处理评论内容
    if (comment && _.trim(comment).length > 0 && orderId > 0) {
      await this.service.comment.create(ctx.user.id, ctx.user.username, signId, _.trim(comment), consts.commentTypes.order, orderId);
    }

    const ret = ctx.msg.success;
    ret.data = { orderId };
    this.ctx.body = ret;
  }

  // 保存交易hash
  async saveTxhash() {
    const { ctx } = this;
    const { orderId, txhash } = this.ctx.request.body;
    const result = await this.service.shop.order.saveTxhash(orderId, ctx.user.id, txhash);

    ctx.body = ctx.msg.success;
  }

  async myProducts() {

    const ctx = this.ctx;
    const userid = ctx.user.id;

    const { page = 1, pagesize = 20, platform = '' } = ctx.query;

    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    let result = {};
    if (platform === 'cny') {
      result = await this.service.shop.order.getUserArticle(page, pagesize, userid);
    } else {
      result = await this.service.shop.order.getUserProducts(page, pagesize, userid);
    }

    if (result === null) {
      ctx.body = ctx.msg.failure;
    } else {
      ctx.body = {
        ...ctx.msg.success,
        data: result,
      };
    }
  }


  // 创建订单
  async createOrder() {
    const { ctx } = this;
    const { items, useBalance } = ctx.request.body;
    if (useBalance !== 1 && useBalance !== 0) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    const result = await ctx.service.shop.orderHeader.createOrder(ctx.user.id, items, useBalance, ctx.ip);
    if (result === '-1') {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }

  // 修改订单
  async updateOrder() {
    const { ctx } = this;
    const tradeNo = ctx.params.tradeNo;
    const { useBalance } = ctx.request.body;
    if (useBalance !== 1 && useBalance !== 0) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    const result = await ctx.service.shop.orderHeader.updateOrder(ctx.user.id, tradeNo, useBalance);
    if (result < 0) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = ctx.msg.success;
  }

  // 根据订单号查看订单
  async get() {
    const { ctx } = this;
    const tradeNo = ctx.params.tradeNo;
    const orderHeader = await ctx.service.shop.orderHeader.get(ctx.user.id, tradeNo);
    const orderPriceItem = await ctx.service.shop.order.get(ctx.user.id, tradeNo);
    const orderTokenItem = await ctx.service.exchange.getOrderAndSymbol(ctx.user.id, tradeNo);
    if (!orderHeader) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: {
        ...orderHeader,
        items: {
          orderPriceItem,
          orderTokenItem,
        },
      },
    };
  }

  // 处理0元订单
  async handleAmount0() {
    const { ctx } = this;
    const { tradeNo } = ctx.request.body;
    const succeed = await this.service.shop.orderHeader.handleAmount0(ctx.user.id, tradeNo);
    if (succeed) {
      ctx.body = ctx.msg.success;
    } else {
      ctx.body = ctx.msg.failure;
    }
  }

}

module.exports = OrderController;
