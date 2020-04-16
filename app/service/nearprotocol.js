
'use strict';
// const nearlib = require('nearlib');
const { Service } = require('egg');
// const CONTRACT_NAME = 'syntest2';

class NearService extends Service {
  /* constructor(ctx) {
    super(ctx);
    const nearConfig = {
      networkId: 'default',
      nodeUrl: 'https://rpc.nearprotocol.com',
      contractName: CONTRACT_NAME,
      walletUrl: 'https://wallet.nearprotocol.com',
      helperUrl: 'https://near-contract-helper.onrender.com',
    };
    ctx.nearConfig = nearConfig;
  }
  async near() {
    const nearConfig = this.ctx.nearConfig;
    const keyStore = new nearlib.keyStores.UnencryptedFileSystemKeyStore('neardev');
    const near = await nearlib.connect({
      deps: {
        keyStore,
      },
      ...nearConfig,
    });
    return near;
  }
  async wallet() {
    const near = await this.near();
    const walletConnection = new nearlib.WalletConnection(near);
    return walletConnection;
  }
  async contract() {
    const near = await this.near();
    const nearConfig = this.ctx.nearConfig;
    // const wallet = await this.wallet();
    const accountId = 'shellteo';
    console.log(accountId);
    const contract = await near.loadContract(nearConfig.contractName, {
      viewMethods: [ 'get_proposal', 'get_create_cost', 'get_proposal_count', 'get_proposal_status', 'get_proposal_expiration_time', 'count_votes', 'balance_of' ],
      changeMethods: [ 'create_proposal', 'set_proposal_to_tally', 'set_proposal_to_ended', 'set_create_cost', 'cast_vote', 'mint' ],
      sender: accountId,
    });
    return contract;
  } */
  async mint(name, amount = 100) {
    amount = parseInt(amount);
    const contract = this.app.nearcontract;
    const res = await contract.mint({
      name,
      amount,
    });
    return res;
  }
  async rawMint(name, amount = 100) {
    amount = parseInt(amount);
    const contract = this.app.nearRawContract;
    const result = await contract.mint({
      name,
      amount,
    });
    this.ctx.logger.info('service nearprotocol rawMint', result);
    const txHash = result.transaction.hash;
    const blockHash = result.transaction_outcome.block_hash;
    return {
      txHash,
      blockHash,
    };
  }
  async balance(name) {
    const contract = this.app.nearcontract;
    const res = await contract.balance_of({ name });
    return res;
  }
  async getProposalCount() {
    const contract = this.app.nearcontract;
    const res = await contract.get_proposal_count();
    return res;
  }
  async getProposal(proposal_id) {
    proposal_id = parseInt(proposal_id);
    try {
      const contract = this.app.nearcontract;
      const result = await contract.get_proposal({
        proposal_id,
      });
      return result;
    } catch (error) {
      this.logger.error(`service.nearprotocol.getProposal id: ${proposal_id}, error :${error}`);
      return null;
    }
  }
  async setCreateCost(cost) {
    cost = parseInt(cost);
    const contract = this.app.nearcontract;
    const res = await contract.set_create_cost({ cost });
    this.ctx.logger.info('service.nearprotocol.setCreateCost result: ', res);
    return res;
  }
}

module.exports = NearService;
