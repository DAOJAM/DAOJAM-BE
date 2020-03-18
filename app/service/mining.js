'use strict';
const consts = require('./consts');
const moment = require('moment');

const Service = require('egg').Service;

class LikeService extends Service {

  /*
  1. 首次打开3天内的文章，额外获得积分，用户立即+5个积分（claim的时候领取，如果不claim就没有了），作者立即+1积分（不需要claim）
  2. 每篇文章最多对应10积分，连续阅读5分钟即可得到全部，阅读完成后，需要告知我们是否推荐当前内容，当用户推荐的时候，则作者可额外得用户所得的积分一半；当用户不推荐的时候，则作者不得积分
  3. 阅读超过2分钟，但没有点击推荐/不推荐，作者+1积分

  1. 防作弊的手段：用户每日有上限，作者每天不应该有上限
  2. 同时打开多篇文章，怎么计算阅读时间，判断两次claim的时间间隔
  3. csrf

  防御CSRF攻击，cross site request forgery，跨站请求伪造
  伪装来自受信任用户的请求，攻击者盗用你的身份，以你的名义向网站发送恶意请求

  1. 验证http referer信息，在passport中判断，http referer图片防盗的效果很好
  2. x_csrf_token 每次打开文章新生成一个x_csrf_token (文章Id,salt,timestamp) 加密

  外汇管制
  账号体系

  安全|常见的Web攻击手段之CSRF攻击
  https://www.jianshu.com/p/67408d73c66d
  https://blog.csdn.net/u011250882/article/details/49679535/
  https://blog.csdn.net/xiaoxinshuaiga/article/details/80766369
  https://juejin.im/post/5a37c3f9518825258b741f49
  https://www.zhihu.com/question/40159698


  redis缓存，定时任务处理
  redis记录用户阅读日志，判断是否首次打开3天内的文章，只需保留3天即可，因为超过3天就没有额外奖励了
  数据库记录用户积分日志，每个用户每篇文章只能获得一次积分
  redis记录用户阅读开始时间，claim的时候判断时长，计算积分

  https://www.geetest.com/Deepknow
  深知：通过用户手机号码、ip、设备、登录到点赞的流程等等判断，给用户打风险分（可以看成是一个风控系统），防止黑产注册成千上万的账号薅羊毛，每日生成报告

  todo：
  1. 读者每日上限？？？
  2. 如何防止用户发文刷积分
  3. csrf
  4. 人机验证，防刷
  5. 接口加密
  6. 接口限流
  7. 删除文章，扣除发文积分，是否扣除阅读积分
  8. 如果显示恶意发文刷积分
  */

  // csrf验证要开启
  // 开始阅读，每个用户每篇文章只能赞或踩一次，如果已经点赞或踩则不用调用
  async reading(userId, signId) {
    // 更新redis
    // redis_key：'reading:userId:signId', 记录阅读的开始时间;
    const timestamp = Math.floor(Date.now() / 1000);
    const TTL = 3 * 24 * 3600; // 保留3天
    const rediskey_reading = `reading:${userId}:${signId}`;
    const value = timestamp;
    await this.app.redis.set(rediskey_reading, value, 'EX', TTL);
  }

  // 获取是否点赞过
  async liked(userId, signId) {
    const rediskey_readHistory = `readhistory:${userId}:${signId}`;
    const readhistory = await this.app.redis.get(rediskey_readHistory);
    if (readhistory) {
      return readhistory;
    }
    return 0;
  }

  // 赞
  async like(userId, signId, time, ip) {
    return await this.do_like(userId, signId, time, ip, 2);
  }

  // 踩
  async dislike(userId, signId, time, ip) {
    return await this.do_like(userId, signId, time, ip, 1);
  }

  // 处理赞和踩获取积分规则
  // likeStatus：2赞，1踩
  async do_like(userId, signId, time, ip, likeStatus) {
    // 1. 文章是否存在
    const post = await this.service.post.get(signId);
    if (!post) {
      return -9;
    }

    // 2. 判断是否已经claim过阅读积分
    const rediskey_readHistory = `readhistory:${userId}:${signId}`; // todo key写到统一的一个地方
    const readhistory = await this.app.redis.get(rediskey_readHistory);
    if (readhistory) {
      return -1;
    }

    // 3. 读取redis获取阅读开始时间
    const rediskey_reading = `reading:${userId}:${signId}`;
    const reading = await this.app.redis.get(rediskey_reading);
    // 没有开始阅读记录
    if (!reading) {
      return -1;
    }
    // server_time 服务端时间差
    const server_time = Date.now() / 1000 - parseInt(reading);
    // time 客户端时间差
    // 客户端时间小于服务端时间有效，否则认为是异常提交，不做处理， //误差小于10秒有效 Math.abs(time - server_time) < 10
    if (time > server_time) {
      return -8;
    }

    // redis里判断是否已经获取过阅读积分，仅仅缓存使用，最终以mysql为准
    // todo 性能优化：1. 先写入redis，然后异步处理，2. 数据库分库/分表，3. 日志直接记录到redis


    // 还需要判断两次提交时间，时间过短则有问题

    // 小值有效 const interval = time > server_time ? server_time : time;

    // 单个用户 单篇文章 阅读最多可以获得多少积分
    const max_point = this.config.points.readOnceMax;
    // 每获取1分需要阅读多少秒
    const perPointSeconds = this.config.points.readRate;
    let reader_point = Math.floor(time * 1.0 / perPointSeconds);
    if (reader_point > max_point) reader_point = max_point;
    // 阅读积分小于1分，记录推荐/不推荐状态，不加积分
    if (reader_point < 1) {
      // 只需处理推荐/不推荐数量
      const conn = await this.app.mysql.beginTransaction();
      try {
        if (likeStatus === 2) {
          await conn.query('UPDATE post_read_count SET likes=likes+1 WHERE post_id=?;', [ signId ]);
        } else {
          await conn.query('UPDATE post_read_count SET dislikes=dislikes+1 WHERE post_id=?;', [ signId ]);
        }
        // 提交事务
        await conn.commit();
        // 删除redis，是必须的吗？
        await this.app.redis.del(rediskey_reading);
        // 4.5 插入redis readhistory，表示已经获取积分， 踩时候状态记录1， 顶时候状态记录2
        await this.app.redis.set(rediskey_readHistory, likeStatus);
        return 0;
      } catch (e) {
        await conn.rollback();
        this.logger.error('Mining.like exception. %j', e);
        return -1;
      }
    }

    // 4. 处理积分
    const conn = await this.app.mysql.beginTransaction();
    try {
      // 4.1 读者积分
      if (await this.setTodayPoint(userId, consts.pointTypes.read, reader_point)) {
        // 更新用户阅读积分
        await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
          [ userId, reader_point, reader_point ]);

        // 插入log日志，并判断是否已经插入过
        const type = likeStatus === 2 ? consts.pointTypes.readLike : consts.pointTypes.readDislike;
        const logResult = await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip, reading_time) '
          + 'SELECT ?, ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM assets_points_log WHERE uid=? AND sign_id=? AND type=? );',
        [ userId, signId, reader_point, moment().format('YYYY-MM-DD HH:mm:ss'), type, ip, time, userId, signId, type ]);

        if (logResult.affectedRows !== 1) {
          conn.rollback();
          return -1;
        }
      }

      // 4.2 推荐人积分
      const reader = await this.service.user.get(userId);
      if (reader.referral_uid > 0) {
        const referralPoint = Math.floor(reader_point * this.config.points.readReferralRate);
        if (referralPoint > 0) {
          await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;', [ reader.referral_uid, referralPoint, referralPoint ]);
          await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
            [ reader.referral_uid, signId, referralPoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.readReferral, ip ]);
        }
      }

      // 4.3 作者积分
      if (likeStatus === 2) {
        const authorPoint = Math.floor(reader_point * this.config.points.readAuthorRate);
        if (authorPoint > 0) {
          await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;', [ post.uid, authorPoint, authorPoint ]);
          await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
            [ post.uid, signId, authorPoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.beread, ip ]);
        }
      }

      // 4.4 更新点赞/点踩次数
      if (likeStatus === 2) {
        await conn.query('UPDATE post_read_count SET likes=likes+1 WHERE post_id=?;', [ signId ]);
      } else {
        await conn.query('UPDATE post_read_count SET dislikes=dislikes+1 WHERE post_id=?;', [ signId ]);
      }

      // 处理邀请任务完成积分
      const rediskey_invite = `invite:read:${userId}`;
      if (reader.referral_uid > 0 && (Date.now() - reader.create_time) / (24 * 3600 * 1000) <= 30) {
        const x = await this.app.redis.rpop(rediskey_invite);
        if (parseInt(x) === 5) {
          const invitePoint = this.config.points.regInviteFinished;
          await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
            [ reader.referral_uid, invitePoint, invitePoint ]);
          await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
            [ reader.referral_uid, 0, invitePoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.regInviteFinished, ip ]);
        }
      }

      // 提交事务
      await conn.commit();

      // 删除redis，是必须的吗？
      await this.app.redis.del(rediskey_reading);

      // 4.5 插入redis readhistory，表示已经获取积分， 踩时候状态记录1， 顶时候状态记录2
      await this.app.redis.set(rediskey_readHistory, likeStatus);

      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('Mining.like exception. %j', e);
      return -1;
    }
  }

  async readNew(userId, signId, time, ip) {
    // 1. 文章是否存在
    const post = await this.service.post.get(signId);
    if (!post) {
      return -9;
    }

    // 2. 判断是否已经claim过阅读新内容积分
    const rediskey_readNew = `readNew:${userId}:${signId}`; // todo key写到统一的一个地方
    const readNew = await this.app.redis.get(rediskey_readNew);
    if (readNew) {
      return -1;
    }

    // 3. 读取redis获取阅读开始时间
    const rediskey_reading = `reading:${userId}:${signId}`;
    const reading = await this.app.redis.get(rediskey_reading);
    // 没有开始阅读记录
    if (!reading) {
      return -1;
    }
    // server_time 服务端时间差
    const server_time = Date.now() / 1000 - parseInt(reading);
    // time 客户端时间差
    // 客户端时间小于服务端时间有效，否则认为是异常提交，不做处理， //误差小于10秒有效 Math.abs(time - server_time) < 10
    if (time > server_time) {
      return -2;
    }

    // 小于30秒无效
    if (time < 30) {
      return -3;
    }

    // 3天以上的文章直接返回
    if ((Date.now() - post.create_time) / (24 * 3600 * 1000) > 3) {
      return 0;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 4. 阅读3天内的新文章
      const readnewPoint = this.config.points.readNew;
      const readNewAuthorPoint = this.config.points.readNewAuthor;

      if (await this.setTodayPoint(userId, consts.pointTypes.read, readnewPoint)) {
        // 用户额外+5
        const readnewlogResult = await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) '
          + 'SELECT ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM assets_points_log WHERE uid=? AND sign_id=? AND type=? );',
        [ userId, signId, readnewPoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.readNew, ip, userId, signId, consts.pointTypes.readNew ]);
        if (readnewlogResult.affectedRows === 1) {
          await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;', [ userId, readnewPoint, readnewPoint ]);
        }
      }

      // 作者额外+1
      await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;', [ post.uid, readNewAuthorPoint, readNewAuthorPoint ]);
      await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
        [ post.uid, signId, readNewAuthorPoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.bereadNew, ip ]);

      // 5. 标记已经领取新文章奖励
      const TTL = 3 * 24 * 3600; // 保留3天
      await this.app.redis.set(rediskey_readNew, 1, 'EX', TTL);

      // 提交事务
      await conn.commit();
      return readnewPoint;
    } catch (e) {
      await conn.rollback();
      this.logger.error('Mining.like exception. %j', e);
      return -1;
    }
  }

  // 获取是否领取过阅读新内容积分
  async getReadNew(userId, signId) {
    const rediskey_readNew = `readNew:${userId}:${signId}`; // todo key写到统一的一个地方
    const readnew = await this.app.redis.get(rediskey_readNew);
    if (readnew) {
      return 1;
    }
    return 0;
  }

  // 分页获取我的积分列表
  async points(userId, page, pagesize) {
    const amount = await this.balance(userId);
    // todo，如果积分有消耗，需要修改此处逻辑
    if (amount > 0) {
      const countsql = 'SELECT COUNT(1) AS count FROM assets_points_log l ';
      const listsql = 'SELECT l.sign_id, p.title, l.amount, l.create_time, l.type FROM assets_points_log l LEFT JOIN posts p ON l.sign_id=p.id ';
      const wheresql = 'WHERE l.uid = ? ';
      const ordersql = 'ORDER BY l.id DESC LIMIT ? ,? ';

      const sql = countsql + wheresql + ';' + listsql + wheresql + ordersql + ';';

      const queryResult = await this.app.mysql.query(sql,
        [ userId, userId, (page - 1) * pagesize, 1 * pagesize ]
      );

      const result = {
        amount,
        count: queryResult[0][0].count,
        logs: queryResult[1],
      };
      return result;
    }

    return { amount: 0, count: 0, logs: [] };
  }

  // 获取积分余额
  async balance(userId) {
    const points = await this.app.mysql.select('assets_points', {
      columns: [ 'uid', 'amount' ],
      where: { uid: userId },
    });
    if (points.length > 0) {
      return points[0].amount;
    }
    return 0;
  }

  // 获取用户从单篇文章阅读获取的积分
  async getPointslogBySignId(userId, signId) {
    const pointslog = await this.app.mysql.select('assets_points_log', {
      columns: [ 'amount', 'type', 'create_time' ],
      where: { uid: userId, sign_id: signId },
    });

    return pointslog;
  }

  // 发文获取积分
  async publish(userId, signId, ip) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      // 1. 更新作者积分
      const authorPoint = this.config.points.publish;
      if (await this.setTodayPoint(userId, consts.pointTypes.publish, authorPoint)) {
        // 1.1 更新积分
        await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
          [ userId, authorPoint, authorPoint ]);

        // 1.2 插入log日志，并判断是否已经插入过, todo：加唯一索引，uid,sign_id, type，上下的语句都改下
        const logResult = await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) '
          + 'SELECT ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM assets_points_log WHERE uid=? AND sign_id=? AND type=? );',
        [ userId, signId, authorPoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.publish, ip, userId, signId, consts.pointTypes.publish ]);

        if (logResult.affectedRows !== 1) {
          conn.rollback();
          return -1;
        }
      }

      // 2. 更新推荐人积分
      // 查询用户的referral
      const author = await this.service.user.get(userId);
      if (author.referral_uid > 0) {
        const referralPoint = this.config.points.publishReferral;
        // 2.1 更新积分
        await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
          [ author.referral_uid, referralPoint, referralPoint ]);

        // 2.2 插入log日志，并判断是否已经插入过, todo：加唯一索引，uid,sign_id, type，上下的语句都改下
        const logResult = await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) '
          + 'SELECT ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM assets_points_log WHERE uid=? AND sign_id=? AND type=? );',
        [ author.referral_uid, signId, referralPoint, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.publishReferral, ip, author.referral_uid, signId, consts.pointTypes.publishReferral ]);

        if (logResult.affectedRows !== 1) {
          conn.rollback();
          return -1;
        }
      }

      // 提交事务
      await conn.commit();
      return 0;

    } catch (e) {
      await conn.rollback();
      this.logger.error('Mining.like exception. %j', e);
      return -1;
    }
  }

  // 设置每日获取积分上限，type：read 阅读、publish 发文
  async setTodayPoint(userId, type, amount) {
    // todo：配置
    let dailyMaxPoint = 0;
    if (type === consts.pointTypes.read) {
      dailyMaxPoint = this.config.points.readDailyMax;
    } else if (type === consts.pointTypes.publish) {
      dailyMaxPoint = this.config.points.publishDailyMax;
    }

    const date = moment().format('YYYYMMDD');
    const rediskey_todayPoint = `dailypoint:${type}:${date}:${userId}`;
    const todayPoint = await this.app.redis.get(rediskey_todayPoint);

    const TTL = 3 * 24 * 3600; // 保留3天

    // 查到今天的key，累加
    if (todayPoint) {
      // 是否达到上限
      if (parseInt(todayPoint) + amount <= dailyMaxPoint) {
        await this.app.redis.set(rediskey_todayPoint, parseInt(todayPoint) + amount, 'EX', TTL);
        return true;
      }
      return false;
    }

    // 未查到今天的key，创建
    await this.app.redis.set(rediskey_todayPoint, amount, 'EX', TTL);
    return true;
  }

  // 获取每日积分，type：read 阅读、publish 发文
  async getTodayPoint(userId, type) {
    const date = moment().format('YYYYMMDD');
    const rediskey_todayPoint = `dailypoint:${type}:${date}:${userId}`;
    const todayPoint = await this.app.redis.get(rediskey_todayPoint);
    if (todayPoint) {
      return parseInt(todayPoint);
    }

    return 0;
  }

  /* 获取邀请注册积分
  1. 每成功邀请一名好友注册，邀请者可得到xx积分
  2. 成功被邀请注册，登录即可领取xx积分
  */
  async register(userId, refUserId, ip) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      // 1. 更新邀请人积分
      await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ refUserId, this.config.points.regInviter, this.config.points.regInviter ]);
      await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
        [ refUserId, 0, this.config.points.regInviter, now, consts.pointTypes.regInviter, ip ]);

      // 2. 更新被邀请人积分
      await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ userId, this.config.points.regInvitee, this.config.points.regInvitee ]);
      await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
        [ userId, 0, this.config.points.regInvitee, now, consts.pointTypes.regInvitee, ip ]);

      // 提交事务
      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('Mining.register exception. %j', e);
      return -1;
    }
  }


  /* 登录获取积分
  * 只能获取一次
  * 新老用户积分不一样
  */
  async login(userId, ip) {
    const user = await this.service.user.get(userId);
    const point = user.create_time > Date.parse('2019-8-31') ? this.config.points.loginNew : this.config.points.loginOld;
    const type = consts.pointTypes.login;

    return await this.onceTask(userId, point, type, ip);
  }

  // 完善资料获取积分
  async profile(userId, ip) {
    const point = this.config.points.profile;
    const type = consts.pointTypes.profile;

    return await this.onceTask(userId, point, type, ip);
  }

  // 一次性的任务积分
  async onceTask(userId, point, type, ip) {
    // 2. 判断是否已经claim过登录积分
    const rediskey = `task:${type}:${userId}`; // todo key写到统一的一个地方
    const redisvalue = await this.app.redis.get(rediskey);
    if (redisvalue) {
      return 1;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 1. 更新用户积分
      await conn.query('INSERT INTO assets_points(uid, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ userId, point, point ]);

      // 2 插入log日志，并判断是否已经插入过
      const logResult = await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) '
        + 'SELECT ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM assets_points_log WHERE uid=? AND sign_id=? AND type=? );',
      [ userId, 0, point, moment().format('YYYY-MM-DD HH:mm:ss'), type, ip, userId, 0, type ]);

      if (logResult.affectedRows !== 1) {
        conn.rollback();
        return -1;
      }

      // 已经获取积分，写入redis
      await this.app.redis.set(rediskey, 1);

      // 提交事务
      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('Mining.onceTask exception. %j', e);
      return -1;
    }
  }

  // 获取任务状态
  async getTaskStatus(userId, type) {
    const rediskey = `task:${type}:${userId}`; // todo key写到统一的一个地方
    const redisvalue = await this.app.redis.get(rediskey);
    if (redisvalue) {
      return 1;
    }
    return 0;
  }

  async comment(userId, signId, ip) {
    // 1. 文章是否存在
    const post = await this.service.post.get(signId);
    if (!post) {
      return -9;
    }

    if (post.comment_pay_point === 0) {
      return 0;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 减少评论者的积分
      const result = await conn.query('UPDATE assets_points SET amount=amount-? WHERE uid=? AND amount>=?;', [ post.comment_pay_point, userId, post.comment_pay_point ]);
      if (result.affectedRows !== 1) {
        conn.rollback();
        return -1;
      }
      const log = await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
        [ userId, signId, -post.comment_pay_point, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.commentPay, ip ]);

      // 增加作者的积分
      await conn.query('UPDATE assets_points SET amount=amount+? WHERE uid=? AND amount>=?;', [ post.comment_pay_point, post.uid, post.comment_pay_point ]);
      await conn.query('INSERT INTO assets_points_log(uid, sign_id, amount, create_time, type, ip) VALUES(?,?,?,?,?,?);',
        [ post.uid, signId, post.comment_pay_point, moment().format('YYYY-MM-DD HH:mm:ss'), consts.pointTypes.commentIncome, ip ]);

      // 提交事务
      await conn.commit();
      return log.insertId;
    } catch (e) {
      await conn.rollback();
      this.logger.error('Mining.comment exception. %j', e);
      return -2;
    }
  }

}

module.exports = LikeService;
