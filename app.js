class Bootstrapper {

  constructor(app) {
    this.app = app;
  }

  async didReady() {
    await this.loadCache();
  }

  async loadCache() {
    const { mysql, redis } = this.app;
    await this.app.redis.del('post:score:filter:1');
    await this.app.redis.del('post:score:filter:3');
    await this.app.runSchedule('calculate_hot_score');
    await this.app.runSchedule('count_token_member');

    const schemaVersionKey = 'schema_version';
    const cacheSchemaVersion = 2;

    const currentVersion = await redis.get(schemaVersionKey);
    if (currentVersion !== null && Number(currentVersion) >= cacheSchemaVersion) {
      return;
    }

    this.app.logger.info('Current cache is outdated. Preloading new version...');

    const pipeline = redis.multi();

    let keys = await redis.keys('post:*');
    if (keys.length > 0) pipeline.del(keys);

    pipeline.del('post');

    const posts = await mysql.query('SELECT id, status, channel_id, is_recommend, hot_score, time_down, require_holdtokens, require_buy FROM posts;')
    for (const { id, status, channel_id, is_recommend, require_holdtokens, time_down, hot_score, require_buy } of posts) {
      pipeline.sadd('post', id);

      if (status !== 0) {
        continue;
      }

      if (channel_id === 1) {
        if (is_recommend) pipeline.zadd('post:recommend', id, id);

        // if (require_holdtokens === 0 && require_buy === 0) {
        //   pipeline.zadd('post:hot:filter:1', hot_score, id);
        // } else {
        //   if (require_holdtokens) pipeline.zadd('post:hot:filter:2', hot_score, id);
        //   if (require_buy) pipeline.zadd('post:hot:filter:4', hot_score, id);
        // }
      }
    }

    pipeline.expire('user:recommend', 300);
    pipeline.expire('post:recommend', 300);

    pipeline.set(schemaVersionKey, cacheSchemaVersion);

    await pipeline.exec();
  }

}

module.exports = Bootstrapper;
