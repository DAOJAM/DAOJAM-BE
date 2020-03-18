'use strict';
const Controller = require('../../core/base_controller');

class EthereumAPIController extends Controller {
  async getTransaction() {
    const { ctx } = this;
    const { txHash } = ctx.params;
    try {
      const result = await this.service.ethereum.web3.getTransaction(txHash);
      if (!result) throw 'no transaction was found on chain, maybe missing or failed to broadcast';
      const isPending = (result.blockNumber === null);
      ctx.body = ctx.msg.success;
      ctx.body.data = { isPending, ...result };
    } catch (error) {
      this.logger.error('getTransaction error: ', error);
      ctx.body = ctx.msg.failure;
      ctx.body.data = { error };
    }
  }

  async getTransactionReceipt() {
    const { ctx } = this;
    const { txHash } = ctx.params;
    try {
      const result = await this.service.ethereum.web3.getTransactionReceipt(txHash);
      const isContractCreation = (result.to === null);
      ctx.body = ctx.msg.success;
      ctx.body.data = { isContractCreation, ...result };
    } catch (error) {
      this.logger.error('getTransaction error: ', error);
      ctx.body = ctx.msg.failure;
      ctx.body.data = { error };
    }
  }
}

module.exports = EthereumAPIController;
