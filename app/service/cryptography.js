'use strict';

const Service = require('egg').Service;
const Crypto = require('crypto');

/**
 * CryptographyService 密码学服务
 * 我们目前使用 AES-256-CBC 作为加密算法及其对称性密钥
 **/
class CryptographyService extends Service {
  constructor(ctx, app) {
    super(ctx, app);
    this.key = Buffer.from(this.config.crypto.secretKey, 'hex');
  }

  /**
   * encrypt, 加密文本数据
   * @param {string} text 要加密的**字符串**
   */
  encrypt(text) {
    /**
     * 每次加密都是随机的16字节IV
     * 同样的内容，不同的IV导致不同的密文，提高破译成本
     * 初始向量（iv）对 CBC 算法来说是不需要隐藏的，可以公开
     * 详见 Stack Overflow：https://tinyurl.com/w8fap6e
     */
    const iv = Crypto.randomBytes(16);
    const cipher = Crypto.createCipheriv('aes-256-cbc', Buffer.from(this.key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([ encrypted, cipher.final() ]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
  }

  /**
    * encrypt, 加密文本数据
    * @param {object} encryptedPayload 密文对象，需要 `iv` 和 `encryptedData`
    * @param {string} encryptedPayload.iv 密文的初始向量 (Initialization Vector)
    * @param {string} encryptedPayload.encryptedData 密文本身
    */
  decrypt(encryptedPayload) {
    const iv = Buffer.from(encryptedPayload.iv, 'hex');
    const encryptedText = Buffer.from(encryptedPayload.encryptedData, 'hex');
    const decipher = Crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([ decrypted, decipher.final() ]);
    return decrypted.toString();
  }
}

module.exports = CryptographyService;
