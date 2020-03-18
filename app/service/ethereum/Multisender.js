'use strict';
const Web3Service = require('./web3');
// const BigNumber = require('bignumber.js');
const ABI = require('./abi/MultiSend.json');
const MAX_OF_UINT256 = `0x${Array(64).fill('F').join('')}`;
const senderAddress = '0x4744c1db3ee9d180a5BD5B1081fd26E479C8bc21';
const Token = require('./Token');


class MultiSendService extends Web3Service {
  /**
    * 批量发送代币， 需要 sender 先 approve 我们合约去用 sender 的 token
    * 适合一次性少于32位的小批量转账，因为托管户可能不够 ether 付手续费
    * 超过32人建议使用 delegateSendToken
    * @param {string} token 代币合约地址
    * @param {string} sender 发送人的**私钥**
    * @param {Array<string>} recipients 收款人列表
    * @param {Array<string>} amounts 金额列表，单位为 wei，使用字符串代表的数字（BigNumber）
    */
  sendToken(token, sender, recipients, amounts) {
    // const value = amounts.reduce(
    //   (accumulator, currentValue) => accumulator.plus(currentValue),
    //   new BigNumber(0));
    const contract = new this.web3.eth.Contract(ABI, senderAddress);
    const encodeABI = contract.methods.multisendToken(token, recipients, amounts).encodeABI();
    return this.sendTransaction(sender, encodeABI, {
      to: senderAddress,
      gasLimit: 6000000,
    });
  }

  /**
    * 代理批量发送代币， 需要 sender 先 approve 我们合约去用 sender 的 token
    * 适合大量转账，因为用户可能不够 ether 付手续费，我们的专户有足够的 token
    * 一次性最多指定 200 收款者，建议一次性转账 150人及以下
    * @param {string} token 代币合约地址
    * @param {string} sender 发送人的**公钥**（是的没看错）
    * @param {Array<string>} recipients 收款人列表
    * @param {Array<string>} amounts 金额列表，单位为 wei，使用字符串代表的数字（BigNumber）
    */
  delegateSendToken(token, sender, recipients, amounts) {
    // const value = amounts.reduce(
    //   (accumulator, currentValue) => accumulator.plus(currentValue),
    //   new BigNumber(0));
    const contract = new this.web3.eth.Contract(ABI, senderAddress);
    const encodeABI = contract.methods.delegateMultisendToken(
      token, sender, recipients, amounts
    ).encodeABI();
    return this.sendTransactionWithOurKey(encodeABI, {
      to: senderAddress,
      gasLimit: 8000000,
    });
  }

  estimate(token, recipients, amounts) {
    const contract = new this.web3.eth.Contract(ABI.abi, senderAddress);
    return contract.methods
      .multisendToken(token, recipients, amounts)
      .estimateGas({
        from: this.publicKey,
        gas: 10000000,
      });
  }

  async approveTheMax(token, from) {
    const tokenContract = new Token(20, token);
    return tokenContract._approve(from, senderAddress, MAX_OF_UINT256);
  }

  async getAllowance(token, owner, spender = senderAddress) {
    const tokenContract = new Token(20, token);
    return tokenContract.getAllowance(owner, spender);
  }
}

module.exports = MultiSendService;
