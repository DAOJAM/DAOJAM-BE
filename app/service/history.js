'use strict';

const Service = require('egg').Service;


/**
 * 常用候选列表Service
 * @class HistoryService
 * @extends {Service}
 */
class HistoryService extends Service {
  /**
   * @param {'post'|'token'} key 转让文章｜转赠Fan票
   * @param {Number} value 转让文章/转赠Fan票的用户ID
   * @memberof HistoryService
   */
  async put(key, value) {
    try {
      const { ctx } = this;
      const uid = ctx.user.id;
      this.app.redis.zincrby(`histroy:user:${uid}:${this.getKey(key)}`, 1, value);
    } catch (error) {
      this.logger.error('history.put exception. %j', error);
    }
  }

  /**
   * @param {'post'|'token'} key 转让文章｜转赠Fan票
   * @return {*} 常用候选列表前十
   * @memberof HistoryService
   */
  async get(key) {
    const { ctx } = this;
    const uid = ctx.user.id;
    // const result = await this.app.redis.zrange(`histroy:user:${uid}:${this.getKey(key)}`, -10, -1);
    const result = await this.app.redis.zrevrange(`histroy:user:${uid}:${this.getKey(key)}`, 0, 9);
    return result;
  }

  /**
   * 根据key获取key
   * @param {'post'|'token'} key 转让文章｜转赠Fan票
   * @return {'post'|'token'} key result
   * @memberof HistoryService
   */
  getKey(key) {
    const options = {
      post: 'post',
      token: 'token',
    };
    return options[key];
  }
}

module.exports = HistoryService;
