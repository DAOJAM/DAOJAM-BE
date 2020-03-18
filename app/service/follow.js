'use strict';

const Service = require('egg').Service;
const _ = require('lodash');
const moment = require('moment');

class FollowService extends Service {

  constructor(ctx, app) {
    super(ctx, app);
    this.app.mysql.queryFromat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };
  }

  // 关注动作
  async follow(uid) {
    const ctx = this.ctx;
    const user = ctx.user;

    // 用户不能关注自己
    if (user.id === parseInt(uid)) {
      return 2;
    }

    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const followed_user = await this.service.account.binding.get2({ id: uid });
      // const followed_user = await this.app.mysql.get('users', { id: uid });

      if (!user || !followed_user) {
        return 3;
      }

      const result = await this.app.mysql.query(
        'INSERT INTO follows(username, followed, status, uid, fuid, create_time) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = 1, create_time = ?;',
        [ user.username, followed_user.username, 1, user.id, followed_user.id, now, now ]
      );

      const updateSuccess = result.affectedRows >= 1;

      if (updateSuccess) {
        try {
          await this.app.redis.multi()
            .rpush(`user:${user.id}:follow_list`, uid)
            .rpush(`user:${uid}:follower_list`, user.id)
            .sadd(`user:${user.id}:follow_set`, uid)
            .sadd(`user:${uid}:follower_set`, user.id)
            .hdel(this.service.notification.userCounterKey(user.id), 'follow')
            .exec();
        } catch (e) {
          console.error(e);
        }
        return 0;
      }
      return 1;

    } catch (err) {
      ctx.logger.error(err.sqlMessage);
      return 1;
    }

  }

  // 取关动作
  async unfollow(uid) {
    const ctx = this.ctx;
    const user = ctx.user;

    if (user.id === parseInt(uid)) {
      return 2;
    }

    try {

      const followed_user = await this.service.account.binding.get2({ id: uid });
      // const followed_user = await this.app.mysql.get('users', { id: uid });

      if (!user || !followed_user) {
        return 3;
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const result = await this.app.mysql.query(
        'INSERT INTO follows(username, followed, status, uid, fuid, create_time) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = 0, create_time = ?;',
        [ user.username, followed_user.username, 0, user.id, followed_user.id, now, now ]
      );

      const updateSuccess = result.affectedRows >= 1;

      if (updateSuccess) {
        await this.app.redis.multi()
          .lrem(`user:${user.id}:follow_list`, 1, uid)
          .lrem(`user:${uid}:follower_list`, 1, user.id)
          .srem(`user:${user.id}:follow_set`, uid)
          .srem(`user:${uid}:follower_set`, user.id)
          .hdel(this.service.notification.userCounterKey(user.id), 'follow') // In case of following just a few seconds, showing a ghost notification
          .exec();

        return 0;
      }
      return 1;

    } catch (err) {
      ctx.logger.error(err);
      return 1;
    }

  }

  // 获取某个用户的关注列表
  async follows(pagesize = 20, page = 1, uid = null) {

    if (!uid) {
      return 2;
    }

    const { redis } = this.app;
    const { id: myId } = this.ctx.user;

    const follows = await redis.llen(`user:${uid}:follow_list`);
    const followers = await redis.llen(`user:${uid}:follower_list`);
    const followIds = await redis.lrange(`user:${uid}:follow_list`, (page - 1) * pagesize, page * pagesize);

    const result = [];

    for (const id of followIds) {
      const info = await redis.hgetall(`user:${id}:info`);

      info.fuid = id;
      info.fans = await redis.llen(`user:${id}:follower_list`);

      if (info.nickname === '') info.nickname = null;
      if (info.avatar === '') info.avatar = null;
      info.followed = info.username;
      delete info.username;

      if (myId) {
        info.is_follow = await redis.sismember(`user:${myId}:follow_set`, id);
        info.is_fan = await redis.sismember(`user:${myId}:follower_set`, id);
      } else {
        info.is_follow = false;
        info.is_fan = false;
      }

      result.push(info);
    }

    return {
      totalFollows: follows,
      totalFans: followers,
      list: result,
    };
  }

  // 获取某个用户的粉丝列表
  async fans(pagesize = 20, page = 1, uid = null) {

    if (!uid) {
      return 2;
    }

    const { redis } = this.app;
    const { id: myId } = this.ctx.user;

    const follows = await redis.llen(`user:${uid}:follow_list`);
    const followers = await redis.llen(`user:${uid}:follower_list`);
    const followerIds = await redis.lrange(`user:${uid}:follower_list`, (page - 1) * pagesize, page * pagesize);

    const result = [];

    for (const id of followerIds) {
      const info = await redis.hgetall(`user:${id}:info`);

      info.uid = id;
      info.fans = await redis.llen(`user:${id}:follower_list`);

      if (info.nickname === '') info.nickname = null;
      if (info.avatar === '') info.avatar = null;

      if (myId) {
        info.is_follow = await redis.sismember(`user:${myId}:follow_set`, id);
        info.is_fan = await redis.sismember(`user:${myId}:follower_set`, id);
      } else {
        info.is_follow = false;
        info.is_fan = false;
      }

      result.push(info);
    }

    return {
      totalFollows: follows,
      totalFans: followers,
      list: result,
    };
  }

  // 提供推送信息
  async populateNotifications(userId, fromDate, page, pageSize) {
    fromDate = moment.isMoment(fromDate) ? fromDate.format('YYYY-MM-DD HH:mm:ss') : undefined;
    const fans = await this.ctx.app.mysql.query(`SELECT a.uid, UNIX_TIMESTAMP(a.create_time) AS time, a.username, b.nickname, b.avatar, EXISTS(SELECT id FROM follows WHERE uid = a.fuid AND fuid = a.uid) AS back FROM follows a LEFT JOIN users b on a.uid = b.id WHERE a.fuid = :userId AND a.status = 1${fromDate ? ' AND a.create_time > :fromDate' : ''} ORDER BY a.id DESC LIMIT :start, :end`, {
      userId, fromDate, start: (page - 1) * pageSize, end: 1 * pageSize,
    });
    return _.map(fans, fan => {
      return {
        kind: 'follow',
        source: fan.uid, // undefined if from system,
        destination: userId,
        timestamp: fan.time,
        message: fan.nickname,
        avatar: fan.avatar,
        actions: [{ name: 'follow', emit: fan.back ? undefined : fan.uid }],
      };
    });
  }

}

module.exports = FollowService;
