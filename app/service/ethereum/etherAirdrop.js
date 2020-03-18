'use strict';
const { Transaction } = require('ethereumjs-tx');
const Web3Service = require('./web3');
const BigNumber = require('bignumber.js');
const ABI = require('./abi/MultiSend.json');
const { splitEvery } = require('ramda');
function checkBadLength(targets, amounts) {
  return targets.length !== amounts.length;
}

const contractAddress = '0x4744c1db3ee9d180a5BD5B1081fd26E479C8bc21';

class AirDropService extends Web3Service {
  constructor(ctx) {
    super(ctx);
    const { privateKey } = this.config.ethereum.airdrop;
    this.privateKey = privateKey;
    this.address = this.web3.eth.accounts.privateKeyToAccount(privateKey).address;
    this.multisender = new this.web3.eth.Contract(ABI, contractAddress);
  }

  /**
   * batchAirdropEther 发起 Ether 空投
   * @param {string[]} targetList 收款人名单
   * @param {string[]} amountList 金额名单
   */
  async batchAirdropEther(targetList, amountList) {
    if (checkBadLength(targetList, amountList)) {
      throw new Error('长度不一致');
    }
    const splitEvery200 = splitEvery(200);
    const splittedTargetsBatch = splitEvery200(targetList);
    const splittedAmountsBatch = splitEvery200(amountList);
    const txCount = await this.web3.eth.getTransactionCount(this.address);
    const batchOfTransferTx = splittedTargetsBatch.map((_, idx) => ({
      targets: splittedTargetsBatch[idx],
      amounts: splittedAmountsBatch[idx],
      txCounter: txCount + idx,
    }));
    const txs = batchOfTransferTx.map(
      ({ targets, amounts, txCounter }) => this._batchTransfer(targets, amounts, txCounter)
    );
    const txHashes = await Promise.all(txs);
    return txHashes;
  }

  /**
   * （真正）发起 Ether 空投，一次限制200个人
   * @param {string[]} targets 收款人名单
   * @param {string[]} amounts 金额名单
   * @param {number} txCount 我们派币帐户的count
   */
  async _batchTransfer(targets, amounts, txCount) {
    const { web3 } = this;
    const action = this.multisender.methods.send(targets, amounts);
    const encodeABI = action.encodeABI();
    const totalAmount = amounts.reduce((previous, current) => {
      return new BigNumber(previous).plus(current).toString();
    });
    const gasPrice = await web3.eth.getGasPrice();
    // txCount 决定了交易顺序
    const txObject = {
      to: contractAddress,
      value: web3.utils.toHex(totalAmount),
      nonce: web3.utils.toHex(txCount),
      gasLimit: web3.utils.toHex(8000000),
      gasPrice: web3.utils.toHex(gasPrice),
      data: encodeABI,
    };
    // 创建以太坊交易
    const transaction = new Transaction(txObject, { chain: 'rinkeby' });
    // 对交易进行签名
    const privateKey = Buffer.from(`${this.privateKey.slice(2)}`, 'hex');
    transaction.sign(privateKey);
    return new Promise((resolve, reject) => {
      web3.eth
        .sendSignedTransaction(`0x${transaction.serialize().toString('hex')}`)
        .on('transactionHash', hash => resolve(hash))
        .catch(reject);
    });
  }

}

module.exports = AirDropService;
