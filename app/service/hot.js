'use strict';
const Service = require('egg').Service;

class HotService extends Service {
  async list(page = 1, pagesize = 20, channel_id = 1) {
    if (page < 1 || pagesize < 0) return null;
    const hotKey = 'post:score:filter:' + channel_id;
    const start = (page - 1) * pagesize;
    const end = page * pagesize - 1;
    const result = await this.app.redis.zrevrange(hotKey, start, end);
    return result;
  }
}

module.exports = HotService;
