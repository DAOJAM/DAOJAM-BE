
'use strict';
const Web3Service = require('./web3');
const QVVotingJSON = require('./abi/QVVoting.json');
const contractAddress = '0x9CF123de9927E8a03B12a9bca3B86E84C2dfEA8D';

class VotingService extends Web3Service {
  constructor(ctx, app) {
    super(ctx, app);
    const ABI = QVVotingJSON.abi;
    // StablecoinContract
    ctx.QVVoting = new this.web3.eth.Contract(ABI, contractAddress);
  }

  async _sendTransactionWithOurKey(encodeABI, {
    to = '',
    value = 0,
    gasLimit = 500000,
  }) {
    // owner address的私钥
    const { privateKey } = this.config.ethereum.voting;
    return this.sendTransaction(privateKey, encodeABI, { to, value, gasLimit });
  }

  /**
   * ⚠️ 这个 _mint 函数没有设置权限控制，请在 controller 调用时小心设置好权限控制
   * _mint, 我们作为合约 Minter 给 to 赠送dot
   * 用户领取赠票
   * @param {string} to 收取赠票的地址
   * @param {string} amount 赠票的数量
   */
  _mint(to, amount) {
    const contract = this.ctx.QVVoting;
    const encodeABI = contract.methods.mint(to, amount).encodeABI();
    return this._sendTransactionWithOurKey(encodeABI);
  }

  /**
   *
   * 设置项目状态tally
   * @param {*} _ProposalID 项目id
   * @return {*} 交易结果
   * @memberof StablecoinService
   */
  setProposalToTally(_ProposalID) {
    const contract = this.ctx.QVVoting;
    const encodeABI = contract.methods.setProposalToTally(_ProposalID).encodeABI();
    return this._sendTransactionWithOurKey(encodeABI);
  }

  /**
   * 设置项目状态为end
   * @param {*} _ProposalID id
   * @return {*} 交易结果
   * @memberof StablecoinService
   */
  setProposalToEnded(_ProposalID) {
    const contract = this.ctx.QVVoting;
    const encodeABI = contract.methods.setProposalToEnded(_ProposalID).encodeABI();
    return this._sendTransactionWithOurKey(encodeABI);
  }

  /**
   * 用户投票
   * @param {*} privatekey 用户私钥
   * @param { Number, Number, Boolean } { _ProposalID, numTokens, _vote }
   *  => 对应投票参数 { 项目id, 投票数量, 正反向投票 }
   * @return {*} 结果
   * @memberof StablecoinService
   */
  castVote(privatekey, { _ProposalID, numTokens, _vote }) {
    const contract = this.ctx.QVVoting;
    const encodeABI = contract.methods.castVote(_ProposalID, numTokens, _vote).encodeABI();
    return this.sendTransaction(privatekey, encodeABI);
  }

  /**
   * 创建项目
   * @param {*} privatekey 用户私钥
   * @param {*} { _description, _voteExpirationTime } => { 项目描述, 投票截止时间 }
   * @return {*} 结果
   * @memberof StablecoinService
   */
  createProposal(privatekey, { _description, _voteExpirationTime }) {
    const contract = this.ctx.QVVoting;
    const encodeABI = contract.methods.castVote(_description, _voteExpirationTime).encodeABI();
    return this.sendTransaction(privatekey, encodeABI);
  }

}

module.exports = VotingService;
