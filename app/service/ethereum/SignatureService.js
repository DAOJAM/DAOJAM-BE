'use strict';
const Service = require('egg').Service;
const ethUtil = require('ethereumjs-util');
const sigUtil = require('eth-sig-util');

class EthSignatureService extends Service {
  /**
   * verifyValidity 验证以太坊信息签名的有效期，需要 messageBody 有 time 属性
   * @param {number} period 签名的有效期，单位为分钟
   * @param {object} messageBody 消息体，用户对行为数据进行签名的对象
   * @param {number} messageBody.time 用户对行为数据进行签名时的时间，单位为毫秒（JS的设定）
   * @return {boolean} 如果时间超限则为true，在有效期内为false
   */
  isSignatureExpired(period, messageBody) {
    const timeDiff = new Date().getTime() - messageBody.time;
    return timeDiff > period * 1000;
  }

  isSignatureOK(period, messageBody) {
    return !this.isSignatureExpired(period, messageBody);
  }

  /**
   * verifyAuth 验证以太坊用户进行网站注册和登录
   * @param {string} sig 以太坊钱包的签名
   * @param {object} msgParams 信息参数对象，参考EIP-712
   * @param {string} publickey 用户的以太坊帐户（公钥）
   */
  verifyAuth(sig, msgParams, publickey) {
    // 目前仅允许 {signatureValidityPeriod} 秒内的签名请求,这里是 3 分钟
    const signatureValidityPeriod = 3 * 60;
    const { message } = msgParams;
    if (message.from !== publickey) return false; // 不能签别人钱包地址
    // 从msgParams.time 检测签署的时间，
    const timeDiff = new Date().getTime() - message.time;
    if (timeDiff > signatureValidityPeriod * 1000) return false;
    const recovered = sigUtil.recoverTypedSignature({ data: msgParams, sig });
    return ethUtil.toChecksumAddress(recovered) === ethUtil.toChecksumAddress(publickey);
  }

  /**
   * verifyArticle 验证以太坊登录用户的发布、修改文章行为
   * @param {string} sig 以太坊钱包的签名
   * @param {object} msgParams 信息参数对象，参考EIP-712
   * @param {string} publickey 用户的以太坊帐户（公钥）
   */
  verifyArticle(sig, msgParams, publickey) {
    this.ctx.logger.info('debug info', publickey);
    const { message } = msgParams;
    // 从msgParams.time 检测签署的时间，
    // 目前仅允许 10 分钟 内的签名请求
    if (this.isSignatureExpired(10, message)) return false; // 签名过期了，不给发布
    const recovered = sigUtil.recoverTypedSignature({ data: msgParams, sig });
    return ethUtil.toChecksumAddress(recovered) === ethUtil.toChecksumAddress(publickey);
  }
}

module.exports = EthSignatureService;
