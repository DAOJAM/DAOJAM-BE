'use strict';

const Service = require('egg').Service;
/**
 * In order to gain the TypeScript typings
 * (for intellisense / autocomplete) while
 * using CommonJS imports with require()
 * use the following approach:
 */
const axios = require('axios').default;

class TokenCircleApiService extends Service {
  constructor(ctx, app) {
    super(ctx, app);
    const { baseURL, bearerToken } = this.config.tokenCircleBackend;
    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });
  }

  /**
   * 添加 tokenId 到 token 合约地址的映射（在机器人饭票circle的后端里）
   * 未来如果要API扩充数据，可能改为 addTokenProfile
   * @param {number|string} tokenId Matataki Hosting Token(FanPiao) ID
   * @param {string} name 代币名
   * @param {string} symbol 代币符号
   * @param {number} issuer 发行者UID
   * @param {number} contractAddress 合约地址
   */
  addTokenProfile(tokenId, name, symbol, issuer, contractAddress) {
    return this.client.put(`/token/${tokenId}`, {
      name, symbol, issuer, contractAddress,
    });
  }

  updateTokenContractAddress(tokenId, address) {
    return this.client.patch(`/token/${tokenId}`, {
      contractAddress: address,
    });
  }

  /**
   * 添加 userId 到 托管钱包地址的映射（在机器人饭票circle的后端里）
   * 未来如果要API扩充数据，可能改为 addUserProfile
   * @param {number|string} uid Matataki User / Wallet Hosting ID
   * @param {string} username Matataki 用户名
   * @param {string} address ethereum address of the user wallet
   */
  addUserProfile(uid, username, address) {
    return this.client.put(`/user/${uid}`, {
      username,
      walletAddress: address,
    });
  }

  /**
   * 更新部分数据
   * 未来如果要API扩充数据，可能改为 addUserProfile
   * @param {number|string} uid Matataki User / Wallet Hosting ID
   * @param {object} partialPayload object 对象，需要包含更新的字段
   */
  updateUser(uid, partialPayload) {
    return this.client.patch(`/user/${uid}`, partialPayload);
  }

}

module.exports = TokenCircleApiService;
