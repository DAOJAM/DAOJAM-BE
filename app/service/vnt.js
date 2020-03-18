'use strict';
const consts = require('./consts');
const Vnt = require('vnt');
const vnt = new Vnt();
const privider = 'http://47.104.173.117:8880';
const chainid = 2;
const contractAddress = '0xa5955423c3d3535206dd303359ed5f83b226d03a';

vnt.setProvider(new vnt.providers.HttpProvider(privider));

const Service = require('egg').Service;

class VntService extends Service {

  async thenify(fn) {
    return await new Promise((resolve, reject) => {
      function callback(err, res) {
        if (err) { return reject(err); }
        return resolve(res);
      }
      fn(callback);
    });
  }

  // 验证支付信息
  async verify(payment) {
    try {
      // 没有交易hash
      if (!payment.txhash) {
        return false;
      }

      const transdata = await this.getTransaction(payment.txhash);
      const receipt = await this.getTransactionReceipt(payment.txhash); // status

      if (!transdata || !receipt) {
        return false;
      }

      // 交易状态是否成功
      if (vnt.toDecimal(receipt.status) !== 1) {
        return false;
      }

      // to是否是合约地址
      if (transdata.to !== contractAddress) {
        return false;
      }

      // 金额是否正确
      const amount = vnt.fromWei(transdata.value).toNumber() * 10000;
      if (amount !== payment.amount) {
        return false;
      }

      // 交易备注，格式：sid:123  oid:123
      const input = vnt.toAscii(transdata.input);
      const input_arr = input.split(':');
      // 赞赏支付
      if (payment.action === consts.payActions.support) {
        if (input_arr[0] !== 'sid') {
          return false;
        }

        // 判单赞赏signid，交易data记录的是文章id
        if (parseInt(input_arr[1]) !== payment.signid) {
          return false;
        }

      }
      // 订单支付
      if (payment.action === consts.payActions.buy) {
        if (input_arr[0] !== 'oid') {
          return false;
        }

        // 判单订单id，交易data记录的是订单Id
        if (parseInt(input_arr[1]) !== payment.id) {
          return false;
        }
      }

      const user = await this.service.user.get(payment.uid);
      // 是不是本人支付的
      if (transdata.from !== user.username) {
        return false;
      }

      return true;
    } catch (ex) {
      this.logger.error('VntService.verify error: %j', ex);
      return false;
    }
  }

  // 获取交易结果
  async getTransactionReceipt(txhash) {
    return new Promise((resolve, reject) => {
      vnt.core.getTransactionReceipt(txhash, function(err, data) {
        if (err) {
          this.logger.error('vnt.getTransactionReceipt error: %j', err);
          reject(err);
        } else {
          // console.log(data);
          resolve(data);
        }
      });
    });
  }

  // 获取交易数据
  async getTransaction(txhash) {
    return new Promise((resolve, reject) => {
      vnt.core.getTransaction(txhash, function(err, data) {
        if (err) {
          this.logger.error('vnt.getTransactionReceipt error: %j', err);
          reject(err);
        } else {
          // console.log(data);
          resolve(data);
        }
      });
    });
  }

}

module.exports = VntService;
