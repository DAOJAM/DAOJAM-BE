'use strict';
const Web3Service = require('./web3');
const BigNumber = require('bignumber.js');
const { splitEvery, flatten, compose, map, filter } = require('ramda');
const GetBalancesABI = require('./abi/GetBalances.json');
const axios = require('axios');

class EtherBalanceService extends Web3Service {
  /**
   * 请求远程 API 空投
   * @param {string[]} targets 收款人名单
   * @param {string[]} amounts 金额名单
   */
  async requestAirDrop(targets, amounts) {
    // 没有目标就不发请求了
    if (targets.length === 0) { return null; }
    // AirDrop 工具托管在 Google Firebase Cloud function，是一个 Serverless 应用
    const { api, token } = this.config.ethereum.airdrop;
    return axios({
      url: api,
      method: 'POST',
      headers: { 'x-access-token': token },
      data: { targets, amounts },
    });
  }

  /**
   * 通过命令获取多个钱包余额
   * @param {string} queryCommands 查询托管帐户的 SQL 指令
   * @param {string|number} lowestLimit 最低余额限额，超过限额即无视
   */
  async getUnderBalanceWalletWithCmd(queryCommands, lowestLimit) {
    const { mysql } = this.app;
    const ethAccounts = await mysql.query(queryCommands);
    const addresses = ethAccounts.map(acc => acc.public_key);
    const wallets = await this.getBalances(addresses);
    const needAirdropList = compose(
      map(({ address }) => address),
      filter(({ balance }) => new BigNumber(balance).lt(lowestLimit))
    )(wallets);
    return needAirdropList;
  }

  /**
   * 获取活跃用户（7天之内登录过或exchange帐户）的钱包余额
   * @param {string|number} lowestLimit 最低余额限额，超过限额即无视
   */
  async getActiveUnderBalanceWallet(lowestLimit = this.web3.utils.toWei('0.001', 'ether')) {
    return this.getUnderBalanceWalletWithCmd(`
      select * from account_hosting 
      where blockchain = 'eth' and uid in (
        select id from users 
          where last_login_time >= DATE(NOW()) - INTERVAL 7 DAY or platform = 'cny'
        )`, lowestLimit);
  }

  /**
   * 获取所有用户的钱包余额
   * @param {string|number} lowestLimit 最低余额限额，超过限额即无视
   */
  getUnderBalanceWallet(lowestLimit = this.web3.utils.toWei('0.001', 'ether')) {
    return this.getUnderBalanceWalletWithCmd(`
      select * from account_hosting 
      where blockchain = 'eth'`, lowestLimit);
  }

  /**
   * _getBalances，查询多个钱包的余额，一次限额200个地址
   * @param {Array<string>} addresses 要查询的地址
   */
  async _getBalances(addresses) {
    const contract = new this.web3.eth.Contract(GetBalancesABI, '0x0383928647c7f4ceb5141761E4e733c9f348963e');
    const balances = await contract.methods.getBalancesOfEth(addresses).call();
    const wallets = addresses.map((address, i) => {
      return { address, balance: balances[i] };
    });
    return wallets;
  }

  /**
   * getBalances，查询多个钱包的余额，每200个地址为一次查询调用
   * @param {Array<string>} addresses 要查询的地址
   */
  async getBalances(addresses) {
    const queues = splitEvery(200)(addresses);
    const results = await Promise.all(
      queues.map(addrsInQueue => this._getBalances(addrsInQueue))
    );
    return flatten(results);
  }

}

module.exports = EtherBalanceService;
