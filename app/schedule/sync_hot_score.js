const Subscription = require('egg').Subscription;

// 同步redis热门文章数据， 每天凌晨两点🕑执行一次
class PostScore extends Subscription {

  static get schedule() {
    return {
      cron: '0 0 2 * * ?',
      type: 'worker',
    };
  }
  async subscribe() {
    // 先暂时关掉
    return;
    if (this.ctx.app.config.isDebug) return;
    const postList = await this.app.redis.zrange('post:score:filter:1', 0, -1, 'WITHSCORES');
    const shareList = await this.app.redis.zrange('post:score:filter:3', 0, -1, 'WITHSCORES');
    const postListLen = postList.length;
    const shareListLen = shareList.length;
    const result = [];
    for (let i = 0; i < postListLen; i += 2) {
      result.push({
        id: postList[i],
        hot_score: postList[i + 1],
      });
    }
    for (let i = 0; i < shareListLen; i += 2) {
      result.push({
        id: shareList[i],
        hot_score: shareList[i + 1],
      });
    }
    await this.app.mysql.updateRows('posts', result);
  }
}

module.exports = PostScore;
