'use strict';
const consts = require('../../service/consts');
const Controller = require('../../core/base_controller');

class TelegramController extends Controller {
  async getWalletAddressFromTelegramUid() {
    const { ctx } = this;
    const { id, blockchain = 'ETH' } = ctx.params;
    const user = await this.app.mysql.get('user_accounts', { platform: 'telegram', account: id });
    if (!user) {
      ctx.status = 404;
      ctx.body = ctx.msg.failure;
      return;
    }
    const { uid } = user;
    const hostingAccount = await this.app.mysql.get('account_hosting', { uid, blockchain });
    if (!hostingAccount) {
      ctx.status = 404;
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = {
      code: 0,
      data: {
        public_key: hostingAccount.public_key,
      },
    };

  }
  async getAssociatedInfo() {
    const { ctx } = this;
    const { id } = ctx.params;

    let [ user ] = await this.app.mysql.query('SELECT id, nickname, email, username FROM users WHERE id = (SELECT uid FROM user_accounts WHERE platform = \'telegram\' AND account = ?)', [ id ]);
    if (!user) {
      user = null;
    } else {
      user = {
        id: user.id,
        name: user.nickname || this.service.user.maskEmailAddress(user.email) || user.username,
        username: user.username,
      };
    }

    let minetoken = user ? await this.app.mysql.get('minetokens', { uid: user.id }) : null;
    if (minetoken) {
      minetoken = {
        id: minetoken.id,
        name: minetoken.name,
        symbol: minetoken.symbol,
      };
    }

    ctx.body = {
      ...ctx.msg.success,
      data: {
        user,
        minetoken,
      },
    };
  }
  async getContractAddress() {
    const { ctx } = this;
    const { id } = ctx.params;

    const info = await this.app.mysql.get('minetokens', { id });

    if (!info) {
      ctx.status = 404;
      ctx.body = ctx.msg.failure;
    }

    ctx.body = {
      ...ctx.msg.success,
      data: {
        contractAddress: info.contract_address,
      },
    };
  }

  async transferFrom() {
    const { ctx } = this;
    const { id } = ctx.params;
    const { from, to, value } = ctx.request.body;
    const result = await this.service.token.mineToken.transferFrom(id, from, to, value, this.clientIP, consts.mineTokenTransferTypes.transfer);
    if (!result) ctx.status = 400;
    ctx.body = result ? {
      ...ctx.msg.success,
      data: { tx_hash: result },
    } : ctx.msg.failure;
  }

  async getUserTokenDetail() {
    const { ctx } = this;
    const { userId, symbol } = ctx.params;
    try {
      const { id: tokenId, decimals } = await ctx.service.token.mineToken.getBySymbol(symbol);
      const balance = await ctx.service.token.mineToken.balanceOf(userId, tokenId);
      ctx.body = {
        ...ctx.msg.success,
        data: { balance, decimals },
      };
    } catch (error) {
      ctx.status = 400;
      ctx.body = {
        ...ctx.msg.failure,
        error: error.message,
      };
    }
  }

  async getAllMinetokens() {
    const { ctx } = this;
    const result = await ctx.service.token.mineToken.getAllTokens();
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
}

module.exports = TelegramController;
