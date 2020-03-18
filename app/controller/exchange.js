'use strict';

const Controller = require('../core/base_controller');
const moment = require('moment');
const DEADLINE = 300; // 超时时间300秒

class ExchangeController extends Controller {
  async create() {
    const ctx = this.ctx;

    const { tokenId } = ctx.request.body;
    const result = await ctx.service.token.exchange.create(tokenId);

    if (result === -1) {
      ctx.body = ctx.msg.tokenNotExist;
    } else if (result === -2) {
      ctx.body = ctx.msg.exchangeAlreadyCreated;
    } else if (result === 0) {
      ctx.body = ctx.msg.failure;
    } else {
      ctx.body = ctx.msg.success;
    }
  }

  async get() {
    const ctx = this.ctx;

    const { tokenId } = this.ctx.query;
    const result = await ctx.service.token.exchange.getExchange(tokenId);
    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }

  // todo : 测试代码
  async addLiquidityOrder() {
    const ctx = this.ctx;
    const orderId = parseInt(ctx.request.body.orderId);
    const result = await ctx.service.token.exchange.addLiquidityOrder(orderId);
    ctx.body = result;
  }
  async addLiquidityBalance() {
    const ctx = this.ctx;
    const { tokenId, cny_amount, token_amount, min_liquidity, max_tokens, deadline } = ctx.request.body;
    const result = await ctx.service.token.exchange.addLiquidityBalance(ctx.user.id, tokenId, cny_amount, token_amount, min_liquidity, max_tokens, deadline);
    ctx.body = result;
  }

  async removeLiquidity() {
    const ctx = this.ctx;
    const { tokenId, amount, min_cny, min_tokens } = ctx.request.body;
    const deadline = parseInt(moment().format('X')) + DEADLINE; // 设置unix时间戳
    const result = await ctx.service.token.exchange.removeLiquidity(ctx.user.id, tokenId, amount, min_cny, min_tokens, deadline, this.clientIP);
    if (result === -1) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }

  async cnyToTokenInputOrder() {
    const ctx = this.ctx;
    const orderId = parseInt(ctx.request.body.orderId);
    const result = await ctx.service.token.exchange.cnyToTokenInputOrder(orderId);
    ctx.body = result;
  }
  async cnyToTokenInputBalance() {
    const ctx = this.ctx;
    const { tokenId, cny_sold, min_tokens, deadline, recipient } = ctx.request.body;
    const result = await ctx.service.token.exchange.cnyToTokenInputBalance(ctx.user.id, tokenId, cny_sold, min_tokens, deadline, ctx.user.id);
    ctx.body = result;
  }

  async cnyToTokenOutputOrder() {
    const ctx = this.ctx;
    const orderId = parseInt(ctx.request.body.orderId);
    const result = await ctx.service.token.exchange.cnyToTokenOutputOrder(orderId);
    ctx.body = result;
  }
  async cnyToTokenOutputBalance() {
    const ctx = this.ctx;
    const { tokenId, tokens_bought, max_cny, deadline, recipient } = ctx.request.body;
    const result = await ctx.service.token.exchange.cnyToTokenOutputBalance(ctx.user.id, tokenId, tokens_bought, max_cny, deadline, ctx.user.id);
    ctx.body = result;
  }

  async tokenToCnyInput() {
    const ctx = this.ctx;
    const { tokenId, tokens_sold, min_cny, deadline, recipient } = ctx.request.body;
    const result = await ctx.service.token.exchange.tokenToCnyInput(ctx.user.id, tokenId, tokens_sold, min_cny, deadline, recipient, this.clientIP);
    ctx.body = result;
  }
  async tokenToCnyOutput() {
    const ctx = this.ctx;
    const { tokenId, tokens_sold, min_cny, deadline, recipient } = ctx.request.body;
    const result = await ctx.service.token.exchange.tokenToCnyOutput(ctx.user.id, tokenId, tokens_sold, min_cny, deadline, recipient, this.clientIP);
    ctx.body = result;
  }

  async tokenToTokenInput() {
    const ctx = this.ctx;
    const { inTokenId, tokens_sold, min_tokens_bought, deadline, recipient, outTokenId } = ctx.request.body;
    const result = await ctx.service.token.exchange.tokenToTokenInput(ctx.user.id, inTokenId, tokens_sold, min_tokens_bought, deadline, recipient, outTokenId, this.clientIP);
    ctx.body = result;
  }
  async tokenToTokenOutput() {
    const ctx = this.ctx;
    const { inTokenId, tokens_bought, max_tokens_sold, deadline, recipient, outTokenId } = ctx.request.body;
    const result = await ctx.service.token.exchange.tokenToTokenOutput(ctx.user.id, inTokenId, tokens_bought, max_tokens_sold, deadline, recipient, outTokenId, this.clientIP);
    ctx.body = result;
  }

  async refundOrder() {
    const ctx = this.ctx;
    const orderId = parseInt(ctx.request.body.orderId);
    const result = await ctx.service.token.exchange.refundOrder(orderId);
    ctx.body = result;
  }


  // 以上测试待删除

  // 以input为准，获得output的数量
  async getOutputAmount() {
    const { ctx } = this;
    const { inputTokenId, outputTokenId, inputAmount } = ctx.query;
    let amount = 0;
    if (inputTokenId.toString() === '0') {
      amount = await ctx.service.token.exchange.getCnyToTokenInputPrice(outputTokenId, inputAmount);
    } else if (outputTokenId.toString() === '0') {
      amount = await ctx.service.token.exchange.getTokenToCnyInputPrice(inputTokenId, inputAmount);
    } else {
      amount = await ctx.service.token.exchange.getTokenToTokenInputPrice(inputTokenId, outputTokenId, inputAmount);
    }
    // 判断
    if (amount === -1) {
      ctx.body = ctx.msg.exchangeNotExist;
      return;
    } else if (amount === -2) {
      ctx.body = ctx.msg.exchangeNotEnough;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: amount,
    };
  }
  // 以output为准，获得input的数量
  async getInputAmount() {
    const { ctx } = this;
    const { inputTokenId, outputTokenId, outputAmount } = ctx.query;
    let amount = 0;
    if (inputTokenId.toString() === '0') {
      amount = await ctx.service.token.exchange.getCnyToTokenOutputPrice(outputTokenId, outputAmount);
    } else if (outputTokenId.toString() === '0') {
      amount = await ctx.service.token.exchange.getTokenToCnyOutputPrice(inputTokenId, outputAmount);
    } else {
      amount = await ctx.service.token.exchange.getTokenToTokenOutputPrice(inputTokenId, outputTokenId, outputAmount);
    }
    // 判断
    if (amount === -1) {
      ctx.body = ctx.msg.exchangeNotExist;
      return;
    } else if (amount === -2) {
      ctx.body = ctx.msg.exchangeNotEnough;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: amount,
    };
  }
  async getPoolCnyToTokenPrice() {
    const { ctx } = this;
    const { outputTokenId, inputAmount } = ctx.query;
    const amount = await ctx.service.token.exchange.getPoolCnyToTokenPrice(outputTokenId, inputAmount);
    // 判断
    if (amount === -1) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: amount,
    };
  }
  async getCurrentPoolSize() {
    const { ctx } = this;
    const { tokenId } = ctx.query;
    const currentPoolSize = await ctx.service.token.exchange.getCurrentPoolSize(tokenId);
    if (currentPoolSize === -1) {
      ctx.body = {
        ...ctx.msg.success,
        data: {
          cny_amount: 0,
          token_amount: 0,
          total_supply: 0,
        },
      };
    } else {
      ctx.body = {
        ...ctx.msg.success,
        data: currentPoolSize,
      };
    }
  }
  async getYourPoolSize() {
    const { ctx } = this;
    const uid = ctx.user.id;
    const { tokenId } = ctx.query;
    const yourPoolSize = await ctx.service.token.exchange.getYourPoolSize(uid, tokenId);
    if (yourPoolSize === -1) {
      ctx.body = {
        ...ctx.msg.success,
        data: {
          cny_amount: 0,
          token_amount: 0,
          your_supply: 0,
        },
      };
    } else {
      ctx.body = {
        ...ctx.msg.success,
        data: yourPoolSize,
      };
    }
  }
  async getYourMintToken() {
    const { ctx } = this;
    const { amount, tokenId } = ctx.query;
    const yourMintToken = await ctx.service.token.exchange.getYourMintToken(amount, tokenId);
    if (yourMintToken === -1) {
      ctx.body = {
        ...ctx.msg.success,
        data: amount,
      };
    } else {
      ctx.body = {
        ...ctx.msg.success,
        data: yourMintToken,
      };
    }
  }
  // 订单状态修改通知
  async notify() {
    const { ctx } = this;
    const { trade_no } = ctx.query;
    const order = await ctx.service.exchange.getOrderBytradeNo(trade_no);
    if (order === null) {
      ctx.body = ctx.msg.failure;
    } else {
      ctx.body = {
        ...ctx.msg.success,
        data: order.status, // 状态，0初始，3支付中，6支付成功，9处理完成
      };
    }
  }
  async swap() {
    const { ctx } = this;
    const { inputTokenId, outputTokenId, amount, limitValue, base } = ctx.request.body;
    if (inputTokenId === 0) {
      ctx.body = ctx.msg.failure;
      return;
    }
    let result = -1;
    const deadline = parseInt(moment().format('X')) + DEADLINE; // 设置unix时间戳
    const recipient = ctx.user.id; // 接收者
    if (outputTokenId === 0) {
      // token 换 cny
      if (base === 'input') {
        result = await ctx.service.token.exchange.tokenToCnyInput(ctx.user.id, inputTokenId, amount, limitValue, deadline, recipient, this.clientIP);
      } else {
        result = await ctx.service.token.exchange.tokenToCnyOutput(ctx.user.id, inputTokenId, amount, limitValue, deadline, recipient, this.clientIP);
      }

    } else {
      // token 换 token
      if (base === 'input') {
        result = await ctx.service.token.exchange.tokenToTokenInput(ctx.user.id, inputTokenId, amount, limitValue, deadline, recipient, outputTokenId, this.clientIP);
      } else {
        result = await ctx.service.token.exchange.tokenToTokenOutput(ctx.user.id, inputTokenId, amount, limitValue, deadline, recipient, outputTokenId, this.clientIP);
      }

    }
    if (result === -1) {
      ctx.body = ctx.msg.failure;
    } else {
      ctx.body = {
        ...ctx.msg.success,
        data: result,
      };
    }
  }
  // 获取份额
  async getOutputPoolSize() {
    const { ctx } = this;
    const { amount, tokenId } = ctx.query;
    const result = await ctx.service.token.exchange.getOutputPoolSize(amount, tokenId);
    if (result === -1) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }

  // 已经转移到mineToken.getBalance()
  // async getUserBalance() {
  //   const { ctx } = this;
  //   const userId = ctx.user.id; // 接收者
  //   const { tokenId } = ctx.query;
  //   // const result = await ctx.service.exchange.getUserBalance(userId, tokenId);
  //   const result = await ctx.service.token.mineToken.balanceOf(userId, tokenId);
  //   ctx.body = {
  //     ...ctx.msg.success,
  //     data: result,
  //   };
  // }

}

module.exports = ExchangeController;
