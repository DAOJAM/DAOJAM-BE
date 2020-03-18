'use strict';
const Service = require('egg').Service;
const moment = require('moment');
const TABLE = 'notifications';
const DEFAULT_PAGE_SIZE = 20;
const TIME_CHECK_FROM = 'check_time';
const TIME_READ_TILL = 'read_time';
const TIME_TYPES = [ TIME_CHECK_FROM, TIME_READ_TILL ];
const TIME_TYPES_CALL = {
  [TIME_CHECK_FROM]: 'checkNotificationFrom',
  [TIME_READ_TILL]: 'readNotificationsTill',
};
const isValidTimeType = type => TIME_TYPES.includes(type);

class NotificationService extends Service {
  constructor(ctx, app) {
    super(ctx, app);
    this.providers = { // TODO make me configurable
      follow: this.service.follow,
      recommend: null,
      comment: null,
      messaging: null,
      notice: null,
    };
    this.app.mysql.queryFormat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };
  }

  userCounterKey(userId) {
    return `notification:counter:uid:${userId}`;
  }

  async overview() {
    const user = this.ctx.user;
    if (!user) return 2; // 不是有效用户
    const cacheKey = this.userCounterKey(user.id);
    if (await this.app.redis.exists(cacheKey)) {
      return this.app.redis.hgetall(cacheKey);
    }
    const providers = await this.app.mysql.select(TABLE, {
      where: { uid: user.id },
      columns: [ 'provider', 'read_time' ],
    });
    const counters = {};
    for (const p in this.providers) {
      if (this.providers.hasOwnProperty(p)) {
        const provider = this.providers[p];
        if (provider && typeof provider.populateNotifications === 'function') {
          const memorized = providers.find(i => i.provider === p);
          try {
            counters[p] = ((await provider.populateNotifications(user.id, memorized && memorized.read_time ? moment(memorized.read_time) : undefined, 1, 100)) || []).length;
          } catch (err) {
            this.ctx.logger.error(err);
          }
        }
      }
    }
    await this.app.redis.hmset(cacheKey, counters);
    await this.app.redis.expire(cacheKey, 60);
    return counters;
  }

  async fetch(providerName, timeType, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    if (!isValidTimeType(timeType)) return 1; // 时间类型
    if (providerName && !(providerName in this.providers)) return 1;
    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) pageSize = DEFAULT_PAGE_SIZE;
    const user = this.ctx.user;
    if (!user) return 2; // 不是有效用户
    const providers = await this.app.mysql.select(TABLE, {
      where: { uid: user.id, provider: providerName || undefined },
      columns: [ 'provider', timeType ],
    });
    const result = {};
    for (const p in this.providers) {
      if (this.providers.hasOwnProperty(p)) {
        const provider = this.providers[p];
        if (provider && typeof provider.populateNotifications === 'function') {
          const memorized = providers.find(i => i.provider === p);
          try {
            result[p] = await provider.populateNotifications(user.id, memorized && memorized[timeType] ? moment(memorized[timeType]) : undefined, page, pageSize);
          } catch (err) {
            this.ctx.logger.error(err);
            result[p] = []; // Provider exist but currently unavailable
          }
        } else {
          result[p] = null; // Provider not implemented or disabled, shown in sort of grayed UI
        }
      }
    }
    return providerName ? result[providerName] : result;
  }

  async mark(providerName, timeType) {
    if (!isValidTimeType(timeType)) return 1;
    const user = this.ctx.user;
    if (!user) return 2; // 不是有效用户
    const provider = this.providers[providerName];
    try {
      if (provider && typeof provider[TIME_TYPES_CALL[timeType]] === 'function') provider[TIME_TYPES_CALL[timeType]](moment());
    } catch (err) {
      this.ctx.logger.error(err);
      return 3;
    }
    const now = moment().format('YYYY-MM-DD HH:mm:ss'); // Possible MySQL timezone issue
    await this.app.mysql.query(`INSERT INTO ${TABLE} (uid, provider, ${timeType}) VALUES (:userId, :providerName, :now) ON DUPLICATE KEY UPDATE ${timeType} = :now`, { userId: user.id, providerName, now });
    if (timeType === TIME_READ_TILL) await this.app.redis.hdel(this.userCounterKey(user.id), providerName);
  }

  async checkAfter(providerName) {
    return this.mark(providerName, TIME_CHECK_FROM);
  }

  async read(providerName) {
    return this.mark(providerName, TIME_READ_TILL);
  }

}

module.exports = NotificationService;
