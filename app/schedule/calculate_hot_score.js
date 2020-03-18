const Subscription = require('egg').Subscription;
const moment = require('moment');

// 热门文章数据计算
class PostScore extends Subscription {

  static get schedule() {
    return {
      interval: '5s',
      type: 'worker',
    };
  }

  async subscribe() {
    if (this.ctx.app.config.isDebug) return;
    this.logger.info('Running:schedule calculate_hot_score');
    /*
    -- 计算热度积分
    UPDATE posts p INNER JOIN post_read_count c ON p.id = c.post_id
    SET p.hot_score = (c.real_read_count * 0.2 + c.likes * 0.4 - c.dislikes * 1 + c.support_count * 1 - c.down * 1);
    -- 3天内的提权
    UPDATE posts SET hot_score = hot_score * 1.5 WHERE create_time > DATE_SUB(NOW(), INTERVAL 3 DAY);
    -- 按天减少权重
    UPDATE posts SET hot_score = hot_score - datediff(now(), create_time) * 3;
    */
    const delPosts = await this.app.mysql.query('SELECT p.id, p.channel_id FROM posts p WHERE p.status!=0;');
    const delPostList = [];
    const delShareList = [];
    for (const delpost of delPosts) {
      const { id, channel_id } = delpost;
      if (channel_id === 1) {
        delPostList.push(id);
      }
      if (channel_id === 3) {
        delShareList.push(id);
      }
    }
    if (delPostList.length > 0) await this.app.redis.zrem('post:score:filter:1', delPostList);
    if (delShareList.length > 0) await this.app.redis.zrem('post:score:filter:3', delShareList);

    const posts = await this.app.mysql.query(
      `SELECT p.id, p.create_time, p.channel_id, c.dislikes, c.likes, c.real_read_count, c.support_count, c.down 
      FROM posts p 
      INNER JOIN post_read_count c 
      ON p.id = c.post_id
      WHERE p.status=0;`
    );
    const postList = [];
    const shareList = [];
    for (const post of posts) {
      const { id, create_time, channel_id, dislikes, likes, real_read_count, support_count, down } = post;
      const hot_score = this.cal(real_read_count, likes, dislikes, down, create_time);
      /* // 计算热度积分
      let hot_score = (real_read_count * 1 + likes * 10 - dislikes * 10 + support_count * 10 - down * 10) + 1000000;
      // 3天内的提权
      if (this.isAfter3Days(create_time)) hot_score += 10;
      // 按小时减少权重
      hot_score -= this.dateDiff(create_time) / 30;
      hot_score /= 10; */
      if (channel_id === 1) {
        postList.push(hot_score, id);
      }
      if (channel_id === 3) {
        shareList.push(hot_score, id);
      }
    }
    if (postList.length > 0) {
      this.app.redis.zadd('post:score:filter:1', postList);
    }
    if (shareList.length > 0) {
      this.app.redis.zadd('post:score:filter:3', shareList);
    }
  }
  isAfter3Days(time) {
    return moment(time).isAfter(moment().subtract(3, 'days'));
  }
  dateDiff(time) {
    return moment().diff(moment(time), 'minute');
  }
  cal(read, like, dis, down, time) {
    const { log2, log, max, abs, round } = Math;
    const second = moment(time).diff(moment('1970-01-01 00:00:00'), 'second');
    let sign = like - dis > 0 ? 1 : (like - dis === 0 ? 0 : -1);
    if (down) sign = -1;
    const score = log(max(read, 1)) + log2(max(1, abs(like - dis))) + round((sign * second / 45000) * (10 ** 7)) / (10 ** 7);
    return score;
  }
}


module.exports = PostScore;
