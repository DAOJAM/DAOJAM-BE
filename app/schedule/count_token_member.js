const Subscription = require('egg').Subscription;

// 根据tokenId groupby 参与人数
class PostScore extends Subscription {

  static get schedule() {
    return {
      interval: '10s',
      type: 'worker',
    };
  }

  async subscribe() {
    // 先暂时关掉
    return;
    if (this.ctx.app.config.isDebug) return;
    this.logger.info('Running:schedule count_token');
    const res = await this.app.mysql.query(
      `SELECT token_id, COUNT(1) as count
      FROM assets_minetokens 
      WHERE amount > 0
      GROUP BY token_id;`
    );
    const result = [];
    for (const item of res) {
      const { count, token_id } = item;
      result.push(count, token_id);
    }
    if (result.length > 0) {
      this.app.redis.zadd('token:member', result);
    }
  }
}


module.exports = PostScore;
