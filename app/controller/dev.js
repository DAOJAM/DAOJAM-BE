'use strict';

const Controller = require('../core/base_controller');

// 仅用于开发调试 service 用途的 controller
// ⚠️ 请设置好接口的权限！！！
class OnlyForDevController extends Controller {
  async getActiveUnderBalanceWallet() {
    const { ctx } = this;
    const result = await this.service.ethereum.etherBalance.getUnderBalanceWallet();
    ctx.body = ctx.msg.success;
    ctx.body.data = { length: result.length, result };
  }

  async justAirDrop() {
    const { ctx } = this;
    const { addresses, amounts } = ctx.request.body;
    try {
      const txHash = await this.service.ethereum
        .etherAirdrop.batchAirdropEther(addresses, amounts);
      ctx.body = ctx.msg.success;
      ctx.body.data = { txHash };
    } catch (error) {
      ctx.body = ctx.msg.failure;
      ctx.body.data = { error };
    }
  }
}

module.exports = OnlyForDevController;
