'use strict';
const consts = require('../../service/consts');
const Controller = require('../../core/base_controller');

class TokenApiController extends Controller {
  async batchTransfer() {
    const { ctx } = this;
    const { tokenId } = ctx.params;
    const { sender, recipients, amounts } = ctx.request.body;
    if (!recipients || !amounts || recipients.length !== amounts.length) {
      ctx.body = ctx.msg.failure;
      ctx.status = 400;
      ctx.body.data = { message: 'Please make sure you have recipients and amounts the same size.' };
    }
    const { contract_address } = await this.service.token.mineToken.get(tokenId);
    const fromWallet = await this.service.account.hosting.isHosting(sender, 'ETH');
    const recipientWallets = await Promise.all(
      recipients.map(id => this.service.account.hosting.isHosting(id, 'ETH'))
    );
    const recipientPublicKey = recipientWallets.map(w => w.public_key);

    try {
      const { transactionHash } = await this.service.ethereum.multisender.delegateSendToken(
        contract_address, fromWallet.public_key, recipientPublicKey, amounts
      );
      // Update DB
      const dbConnection = await this.app.mysql.beginTransaction();
      for (let i = 0; i < recipients.length; i++) {
        await this.service.token.mineToken._syncTransfer(
          tokenId, sender, recipients[i], amounts[i], this.clientIP,
          consts.mineTokenTransferTypes.transfer, transactionHash, dbConnection);
      }
      await dbConnection.commit();
      ctx.body = ctx.msg.success;
      ctx.body.data = { transactionHash };
    } catch (error) {
      ctx.body = ctx.msg.failure;
      ctx.status = 400;
      ctx.body.data = { error };
    }
  }

  async approveTheMax() {
    const { ctx } = this;
    const { tokenId, fromUid } = ctx.params;
    const { contract_address } = await this.service.token.mineToken.get(tokenId);
    const fromWallet = await this.service.account.hosting.isHosting(fromUid, 'ETH');
    const result = await this.service.ethereum.multisender.approveTheMax(contract_address, fromWallet.private_key);
    ctx.body = ctx.msg.success;
    ctx.body.data = { result };
  }

  async getAllowance() {
    const { ctx } = this;
    const { tokenId, fromUid } = ctx.params;
    const { contract_address } = await this.service.token.mineToken.get(tokenId);
    const fromWallet = await this.service.account.hosting.isHosting(fromUid, 'ETH');
    const result = await this.service.ethereum.multisender.getAllowance(contract_address, fromWallet.public_key);
    ctx.body = ctx.msg.success;
    ctx.body.data = { result };
  }
}

module.exports = TokenApiController;
