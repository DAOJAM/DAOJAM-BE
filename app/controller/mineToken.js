'use strict';
const consts = require('../service/consts');
const Controller = require('../core/base_controller');

class MineTokenController extends Controller {
  // 创建
  async create() {
    const ctx = this.ctx;
    const { name, symbol, decimals = 4, logo, brief, introduction, initialSupply } = this.ctx.request.body;
    // 编辑Fan票的时候限制简介字数不超过50字 后端也有字数限制
    if (brief && brief.length > 50) {
      ctx.body = ctx.msg.failure;
    } else if (!initialSupply) {
      ctx.body = ctx.msg.failure;
      ctx.body.message = '请填写初始发行额度';
    } else { // 好耶 字数没有超限
      let txHash;
      try {
        const { public_key } = await this.service.account.hosting.isHosting(ctx.user.id, 'ETH');
        txHash = await this.service.ethereum.fanPiao.issue(name, symbol, decimals, initialSupply, public_key);
      } catch (error) {
        this.logger.error('Create error: ', error);
        ctx.body = ctx.msg.failure;
        ctx.body.data = { error };
      }
      const result = await ctx.service.token.mineToken.create(ctx.user.id, name, symbol, initialSupply, decimals, logo, brief, introduction, txHash); // decimals默认4位
      if (result === -1) {
        ctx.body = ctx.msg.tokenAlreadyCreated;
      } else if (result === -2) {
        ctx.body = ctx.msg.tokenSymbolDuplicated;
      } else if (result === -3) {
        ctx.body = ctx.msg.tokenNoCreatePermission;
      } else if (result === 0) {
        ctx.body = ctx.msg.failure;
      } else {
        ctx.body = {
          ...ctx.msg.success,
          data: result,
        };
      }
    }
  }

  async update() {
    const ctx = this.ctx;
    const tokenId = parseInt(ctx.params.id);
    const { name, logo, brief, introduction } = ctx.request.body;

    // 编辑Fan票的时候限制简介字数不超过50字 后端也有字数限制
    if (brief && brief.length > 50) {
      ctx.body = ctx.msg.failure;
    } else { // 好耶 字数没有超限
      const result = await ctx.service.token.mineToken.update(ctx.user.id, tokenId, name, logo, brief, introduction);
      if (result) {
        ctx.body = ctx.msg.success;
      } else {
        ctx.body = ctx.msg.failure;
      }
    }
  }

  async get() {
    const { ctx } = this;
    const id = ctx.params.id;

    const token = await ctx.service.token.mineToken.get(id);
    const exchange = await ctx.service.token.exchange.detail(id);
    const user = await ctx.service.user.get(token.uid);
    // const vol_24h = await ctx.service.token.exchange.volume_24hour(id);
    if (exchange) {
      const trans_24hour = await ctx.service.token.exchange.trans_24hour(id);
      exchange.volume_24h = parseFloat(trans_24hour.volume_24h.toFixed(4));
      exchange.change_24h = trans_24hour.change_24h;
      exchange.price = parseFloat((exchange.cny_reserve / exchange.token_reserve).toFixed(4));
      exchange.amount_24h = trans_24hour.amount_24h;
    }
    ctx.body = {
      ...ctx.msg.success,
      data:
      {
        user,
        token,
        exchange,
      },
    };
  }

  async saveResources() {
    const ctx = this.ctx;
    const tokenId = parseInt(ctx.params.id);
    const { websites, socials } = this.ctx.request.body;
    const result = await ctx.service.token.mineToken.saveResources(ctx.user.id, tokenId, websites, socials);
    if (result === 0) {
      ctx.body = ctx.msg.success;
    } else {
      ctx.body = ctx.msg.failure;
    }
  }

  async getResources() {
    const ctx = this.ctx;
    const tokenId = parseInt(ctx.params.id);
    const result = await ctx.service.token.mineToken.getResources(tokenId);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }

  // 增发
  async mint() {
    const ctx = this.ctx;
    // amount 客户端*精度，10^decimals
    const { amount } = this.ctx.request.body;
    const result = await ctx.service.token.mineToken.mint(ctx.user.id, ctx.user.id, amount, this.clientIP);
    if (result === -1) {
      ctx.body = ctx.msg.failure;
    } else if (result === -2) {
      ctx.body = ctx.msg.tokenNotExist;
    } else if (result === -3) {
      ctx.body = ctx.msg.tokenCantMint;
    } else {
      ctx.body = ctx.msg.success;
    }
  }

  // 转账
  async transfer() {
    const ctx = this.ctx;
    const { tokenId, to, amount } = this.ctx.request.body;
    // 记录转赠fan票常用候选列表
    await this.ctx.service.history.put('token', to);
    // amount 客户端*精度，10^decimals
    const result = await ctx.service.token.mineToken.transferFrom(tokenId, ctx.user.id, to, amount, this.clientIP, consts.mineTokenTransferTypes.transfer);
    ctx.body = result ? {
      ...ctx.msg.success,
      data: { tx_hash: result },
    } : ctx.msg.failure;
  }

  // 用户需要针对特定 token 进行授权，我们的代理转账合约针对才能他的token进行批量转账
  async approveTokenToBatch() {
    const { ctx } = this;
    const { tokenId } = ctx.params;
    const [ token, fromWallet ] = await Promise.all([
      this.service.token.mineToken.get(tokenId),
      this.service.account.hosting.isHosting(ctx.user.id, 'ETH'),
    ]);
    const result = await this.service.ethereum.multisender.approveTheMax(
      token.contract_address, fromWallet.private_key
    );
    ctx.body = ctx.msg.success;
    ctx.body.data = { result };
  }

  async getBatchAllowance() {
    const { ctx } = this;
    const { tokenId } = ctx.params;
    const [ token, fromWallet ] = await Promise.all([
      this.service.token.mineToken.get(tokenId),
      this.service.account.hosting.isHosting(ctx.user.id, 'ETH'),
    ]);
    const result = await this.service.ethereum.multisender.getAllowance(
      token.contract_address, fromWallet.public_key
    );
    ctx.body = ctx.msg.success;
    ctx.body.data = { result };
  }

  // 批量转账
  async batchTransfer() {
    const ctx = this.ctx;
    const { tokenId } = ctx.params;
    const { targets } = ctx.request.body;
    const filteredTargets = targets.filter(i => i.to && i.amount);
    if (filteredTargets.length !== targets.length) {
      ctx.body = ctx.msg.failure;
      ctx.status = 400;
      ctx.body.data = {
        message: '`to` and `amount` field is missing, please check the data.',
      };
      return;
    }
    if (targets.length > 64) {
      ctx.body = ctx.msg.failure;
      ctx.status = 400;
      ctx.body.data = {
        message: 'too large, the length of targets should be below 64.',
      };
      return;
    }
    try {
      const result = await ctx.service.token.mineToken.batchTransfer(tokenId, ctx.user.id, targets);
      ctx.body = {
        ...ctx.msg.success,
        data: { tx_hash: result },
      };
    } catch (error) {
      ctx.body = ctx.msg.failure;
      ctx.status = 400;
      ctx.body.data = { error };
    }

  }

  // 查询当前用户token余额
  async getBalance() {
    const { ctx } = this;
    const userId = ctx.user.id;
    const { tokenId } = ctx.query;
    const result = await ctx.service.token.mineToken.balanceOf(userId, tokenId);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }

  async getRelated() {
    const { ctx } = this;
    const tokenId = parseInt(ctx.params.id);
    const { channel_id = 1, filter, sort, page, pagesize, onlyCreator } = ctx.query;

    let result;

    if (typeof onlyCreator === 'number' || typeof onlyCreator === 'string') {
      result = await ctx.service.token.mineToken.getRelatedWithOnlyCreator(tokenId, filter, sort, page, pagesize, Boolean(Number(onlyCreator)), channel_id);
    } else {
      result = await ctx.service.token.mineToken.getRelated(tokenId, filter, sort, page, pagesize);
    }

    if (result === false) {
      ctx.status = 400;
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }

}

module.exports = MineTokenController;
