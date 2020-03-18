'use strict';
const Service = require('egg').Service;
const moment = require('moment');

/* 账号托管 */
class AccountHostingService extends Service {
  /**
   * @param {*} uid 用户id
   * @return {boolean} 是否创建成功
   * @memberof AccountHostingService
   */
  async create(uid) {
    try {
      const isHostedEthWallet = await this.isHosting(uid, 'ETH');
      if (isHostedEthWallet) return false;
      const wallet = this.service.ethereum.web3.create();
      // Airdrop 0.03 ETH for the new eth account, await this in the end
      const airdropRequest = this.service.ethereum.etherBalance.requestAirDrop(
        [ wallet.address ], [ '3000000000000000' ]
      );
      this.logger.info('AccountHosting:: create ', wallet);

      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const result = await this.app.mysql.insert('account_hosting', {
        uid,
        public_key: wallet.address,
        private_key: wallet.privateKey,
        blockchain: 'ETH',
        created_at: now,
      });
      this.logger.info('AccountHosting:: create success: %j', result);

      await airdropRequest;
      return wallet.address;
    } catch (err) {
      this.logger.error('AccountHosting:: create error: %j', err);
      return false;
    }
  }

  async isHosting(uid, blockchain) {
    try {
      const result = await this.app.mysql.get('account_hosting', { uid, blockchain });
      return result;
    } catch (err) {
      this.logger.error('AccountHosting:: create error: %j', err);
      return false;
    }
  }
}

module.exports = AccountHostingService;
