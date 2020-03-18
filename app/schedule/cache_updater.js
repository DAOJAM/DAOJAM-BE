const { Subscription } = require('egg');

class CacheUpdater extends Subscription {
  static get schedule() {
    return {
      interval: '5m',
      type: 'worker',
      immediate: true,
    };
  }

  async subscribe() {
    if (this.ctx.app.config.isDebug) return;
    const { mysql, redis } = this.app;

    const pipeline = redis.multi();

    const users = await mysql.query('SELECT id, username, nickname, avatar, is_recommend FROM users;');

    pipeline.del('user:recommend');
    pipeline.hset('user:stat', 'count', users.length);

    for (const { id, username, nickname, avatar, is_recommend } of users) {
      pipeline.hmset(`user:${id}:info`, 'username', this.ctx.service.user.maskEmailAddress(username), 'nickname', nickname, 'avatar', avatar);

      if (is_recommend) pipeline.sadd('user:recommend', id);
    }

    const relationships = await mysql.query('SELECT uid, fuid FROM follows WHERE status = 1;');
    for (const { uid, fuid } of relationships) {
      pipeline.del(`user:${uid}:follow_list`, `user:${fuid}:follower_list`, `user:${uid}:follow_set`, `user:${fuid}:follower_set`);
    }
    for (const { uid, fuid } of relationships) {
      pipeline.rpush(`user:${uid}:follow_list`, fuid);
      pipeline.rpush(`user:${fuid}:follower_list`, uid);
      pipeline.sadd(`user:${uid}:follow_set`, fuid);
      pipeline.sadd(`user:${fuid}:follower_set`, uid);
    }

    pipeline.hset('user:stat', 'point', (await mysql.query('SELECT SUM(amount) as amount FROM assets_points;'))[0].amount);
    pipeline.hset('post:stat', 'count', (await mysql.query('SELECT COUNT(1) as count FROM posts WHERE status = 0;'))[0].count);

    pipeline.del('tag:post', 'tag:product');

    const tags = await this.app.mysql.query(`SELECT id, name, type FROM tags;`);
    for (const { id, name, type } of tags) {
      pipeline.sadd(type === 'post' ? 'tag:post' : 'tag:product', id);
      pipeline.hmset(`tag:${id}`, 'name', name, 'type', type);
    }

    await pipeline.exec();
  }
}

module.exports = CacheUpdater;
