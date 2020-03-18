'use strict';

const Service = require('egg').Service;
const EOS = require('eosjs');
// const ONT = require('ontology-ts-sdk');
const fs = require('fs');
const moment = require('moment');
const downloader = require('image-downloader');
const md5 = require('crypto-js/md5');
const filetype = require('file-type');
const _ = require('lodash');

const introductionLengthInvalid = 4;
const emailDuplicated = 5;
const nicknameDuplicated = 6;
const nicknameInvalid = 7;

const maskedEmailCache = new Map();

class UserService extends Service {

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

  // async find(id) {
  //   return await this.app.mysql.get('users', { id });
  // }

  async get(id) {
    const users = await this.service.account.binding.get2({ id });
    if (users) {
      users.username = this.maskEmailAddress(users.username);
    }
    return users;
    /* const users = await this.app.mysql.select('users', {
      where: { id },
      columns: [ 'id', 'username', 'nickname', 'platform', 'referral_uid', 'create_time', 'avatar', 'level', 'status', 'introduction', 'accept', 'banner' ], // todo：需要再增加
    });
    if (users && users.length > 0) {
      users[0].username = this.maskEmailAddress(users[0].username);
      return users[0];
    }
    return null; */
  }

  async getUserById(id) {
    const ctx = this.ctx;

    // 2.获取某账号关注数
    const follows = await this.app.mysql.query(
      'select count(*) as follows from follows where uid = ? and status=1',
      [ id ]
    );

    // 3.获取某账号粉丝数
    const fans = await this.app.mysql.query(
      'select count(*) as fans from follows where fuid = ? and status=1',
      [ id ]
    );

    let is_follow = false;

    const current_user = ctx.user;

    if (current_user) {
      const result = await this.app.mysql.get('follows', { uid: current_user.id, fuid: id, status: 1 });
      if (result) {
        is_follow = true;
      }
    }

    let nickname = '';
    let avatar = '';
    let introduction = '';
    let banner = '';

    const user = await this.service.account.binding.get2({ id });
    // const user = await this.app.mysql.get('users', { id });
    if (user) {
      avatar = user.avatar || '';
      nickname = user.nickname || '';
      introduction = user.introduction || '';
      banner = user.banner || '';
    } else {
      return null;
    }

    const result = {
      username: this.maskEmailAddress(user.username),
      nickname,
      avatar,
      introduction,
      banner,
      follows: follows[0].follows,
      fans: fans[0].fans,
      is_follow,
      status: user.status,
    };

    ctx.logger.info('debug info', result);

    return result;
  }

  async getUserDetails(userId, platform) {

    const basicInfo = await this.get(userId);

    if (basicInfo === null) {
      return null;
    }

    let accountAttached = 1;
    if (platform === 'github' || platform === 'email') {
      accountAttached = 0;
    }
    basicInfo.accounts = accountAttached;

    // 筛选状态为1，即有效的follow
    const counts = await this.app.mysql.query(
      'SELECT COUNT(*) AS follows FROM follows WHERE uid = :uid AND status = 1;'
      + 'SELECT COUNT(*) AS fans FROM follows WHERE fuid = :uid AND status = 1;'
      + 'SELECT COUNT(*) AS articles FROM posts WHERE uid = :uid AND status = 0;'
      + 'SELECT COUNT(*) AS drafts FROM drafts WHERE uid = :uid AND status = 0;'
      + 'SELECT COUNT(*) AS supports, signid FROM supports s INNER JOIN posts p ON s.signid = p.id WHERE s.uid = :uid AND p.status = 0 AND s.status = 1;'
      + 'SELECT amount FROM assets_points WHERE uid = :uid;' // 查询 assets_points 的 amount 积分
      + 'SELECT COUNT(*) AS referral_amount FROM users WHERE referral_uid = :uid;' // 统计 users 的 referral_uid 数量'=
      + 'SELECT count(1) AS count FROM post_bookmarks WHERE uid = :uid;'
      , { uid: basicInfo.id }
    );
    basicInfo.follows = counts[0][0].follows;
    basicInfo.fans = counts[1][0].fans;
    basicInfo.articles = counts[2][0].articles;
    basicInfo.drafts = counts[3][0].drafts;
    basicInfo.supports = counts[4][0].supports;
    basicInfo.points = counts[5].length > 0 ? counts[5][0].amount : 0;
    basicInfo.referral_amount = counts[6][0].referral_amount;
    basicInfo.bookmarks = counts[7][0].count;
    // console.log(counts, basicInfo.id);

    return basicInfo;
  }

  async getUserList(userids, current_user = null) {

    let userList = [];
    let myFollows = [];
    let myFans = [];

    if (userids.length === 0) {
      return userList;
    }

    let sqlcode = 'SELECT id, username, platform, nickname, avatar, introduction FROM users WHERE id IN (:userids);'
      // 粉丝数量
      + 'SELECT fuid, COUNT(*) AS fans FROM follows WHERE status = 1 AND fuid IN (:userids) GROUP BY fuid;'
      // 关注数量
      + 'SELECT uid, COUNT(*) AS follows FROM follows WHERE status = 1 AND uid IN (:userids) GROUP BY uid;';

    if (current_user) {
      // 这群人是否有fo我
      sqlcode += ('SELECT uid FROM follows WHERE uid IN (:userids) AND fuid = :me AND status = 1;'
        // 我是否有fo这群人
        + 'SELECT fuid FROM follows WHERE fuid IN (:userids) AND uid = :me AND status = 1;');
    }

    const userQuery = await this.app.mysql.query(
      sqlcode,
      { userids, me: current_user }
    );

    userList = userQuery[0];
    const fanCount = userQuery[1];
    const followCount = userQuery[2];

    if (current_user) {
      myFans = userQuery[3];
      myFollows = userQuery[4];
    }

    // 初始化数据
    _.each(userList, everyUser => {
      everyUser.username = this.maskEmailAddress(everyUser.username);
      everyUser.fans = 0;
      everyUser.follows = 0;
      everyUser.is_follow = false;
      everyUser.is_fan = false;
    });

    // 填充每个人的数据
    _.each(userList, everyUser => {
      _.each(fanCount, everyCount => {
        if (everyUser.id === everyCount.fuid) {
          everyUser.fans = everyCount.fans;
        }
      });
      _.each(followCount, everyCount => {
        if (everyUser.id === everyCount.uid) {
          everyUser.follows = everyCount.follows;
        }
      });
      _.each(myFans, everyFan => {
        if (everyUser.id === everyFan.uid) {
          everyUser.is_fan = true;
        }
      });
      _.each(myFollows, everyFollow => {
        if (everyUser.id === everyFollow.fuid) {
          everyUser.is_follow = true;
        }
      });
    });

    return userList;
  }

  async recommendUser(amount, current_user = null) {
    let ids = await this.app.redis.srandmember('user:recommend', amount);
    if (ids.length === 0) {
      ids = (await this.app.mysql.query('SELECT id FROM users WHERE is_recommend = 1;')).map(row => row.id);

      const pipeline = this.app.redis.multi();
      for (const id of ids) {
        pipeline.sadd('user:recommend', id);
      }
      await pipeline.expire('user:recommend', 300).exec();

      ids = await this.app.redis.srandmember('user:recommend', amount);
    }

    const followKey = `user:${current_user}:follow_set`;
    const followerKey = `user:${current_user}:follower_set`;

    const result = [];

    for (const id of ids) {
      const info = await this.app.redis.hgetall(`user:${id}:info`);

      info.id = id;

      if (info.nickname === '') info.nickname = null;
      if (info.avatar === '') info.avatar = null;

      if (current_user != null) {
        info.is_follow = await this.app.redis.sismember(followKey, id);
        info.is_fan = await this.app.redis.sismember(followerKey, id);
      } else {
        info.is_follow = false;
        info.is_fan = false;
      }

      result.push(info);
    }

    return result;
  }

  async setProfile(userid, nickname, introduction, accept) {

    if (userid === null) {
      return false;
    }

    const row = {};

    if (nickname) {
      const nicknameCheck = /^[\u4e00-\u9fa5a-zA-Z0-9]{1,50}$/;
      if (!nicknameCheck.test(nickname)) {
        return nicknameInvalid;
      }

      // 普通用户不能以exchange打头
      if (nickname.toLowerCase().startsWith(this.config.user.virtualUserPrefix)) {
        return nicknameInvalid;
      }

      const { existence } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM users WHERE nickname = ?) existence;', [ nickname ]))[0];
      if (existence) {
        return nicknameDuplicated;
      }

      row.nickname = nickname;
    }

    if (introduction !== null) {
      if (introduction.length > 200) {
        return introductionLengthInvalid;
      }
      row.introduction = introduction;
    }

    if (accept === 0 || accept === 1) {
      row.accept = accept;
    }

    const options = {
      where: {
        id: userid,
      },
    };

    try {
      const result = await this.app.mysql.update('users', row, options);
      await this.service.search.importUser(userid);
      return result.affectedRows === 1;
    } catch (err) {
      this.logger.error('UserService::setProfile error: %j', err);
      return false;
    }
  }

  async setIntroduction(introduction, current_user) {

    if (introduction.length > 20) {
      return introductionLengthInvalid;
    }

    try {
      const row = {
        introduction,
      };

      const options = {
        where: {
          username: current_user,
        },
      };

      const result = await this.app.mysql.update('users', row, options);
      return result.affectedRows === 1;
    } catch (err) {
      this.logger.error('UserService::setIntroduction error: %j', err);
    }
    return false;
  }

  async setEmail(email, current_user) {

    const sameEmail = await this.app.mysql.query(
      'SELECT COUNT(*) AS same_count FROM users WHERE email = ?',
      [ email ]
    );

    if (sameEmail[0].same_count) {
      return emailDuplicated;
    }

    try {
      const row = {
        email,
      };

      const options = {
        where: {
          username: current_user,
        },
      };

      const result = await this.app.mysql.update('users', row, options);
      return result.affectedRows === 1;
    } catch (err) {
      this.logger.error('UserService:: setEmail error: %j', err);
    }
    return false;
  }

  async uploadAvatarFromUrl(avatarurl) {
    const ctx = this.ctx;
    // 由URL抓到图片
    let imageFile;
    try {
      imageFile = await downloader.image({
        url: avatarurl,
        dest: './uploads',
      });
    } catch (err) {
      this.logger.error('UserService:: uploadAvatarFromUrl error: %j', err);
      return null;
    }

    // 判断图片的类型, 设置后缀名
    const fileext = filetype(imageFile.image).ext;

    // 生成随机文件名
    const filename = '/avatar/'
      + moment().format('YYYY/MM/DD/')
      + md5(imageFile.filename + moment().toLocaleString())
      + '.' + fileext;

    this.logger.info('UserService:: uploadAvatarFromUrl info: downloaded: ', avatarurl);

    let result = null;
    try {
      // 上传至OSS
      result = await ctx.oss.put(filename, imageFile.image);
      // 删除本地文件
      await fs.unlinkSync(imageFile.filename);
    } catch (err) {
      this.logger.error('UserService:: uploadAvatarFromUrl error: %j', err);
      return null;
    }

    if (!result) {
      return null;
    }

    return filename;
  }

  async uploadAvatar(filename, filelocation) {
    const ctx = this.ctx;

    let result = null;
    try {
      // 上传至OSS
      result = await ctx.oss.put(filename, filelocation);
      // 删除本地文件
      await fs.unlinkSync(filelocation);
    } catch (err) {
      this.logger.error('UserService:: uploadAvatar error: %j', err);
      return 2;
    }

    if (!result) {
      return 3;
    }

    const setStatus = await this.service.user.setAvatar(filename, ctx.user.id);

    if (setStatus !== 0) {
      return 4;
    }

    return 0;
  }

  async setAvatar(filelocation, userid) {
    let updateSuccess = false;
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      // 如果ID不存在, 会以此ID创建一条新的用户数据, 不过因为jwt secret不会被知道, 所以对外不会发生
      const result = await this.app.mysql.query(
        'INSERT INTO users (id, avatar, create_time) VALUES ( ?, ?, ?) ON DUPLICATE KEY UPDATE avatar = ?',
        [ userid, filelocation, now, filelocation ]
      );

      updateSuccess = result.affectedRows >= 1;

    } catch (err) {
      this.logger.error('UserService:: setAvatar error: %j', err);
      return 2;
    }

    if (updateSuccess) {
      return 0;
    }

    return 3;
  }

  async uploadBannerImage(filename, filelocation) {
    const ctx = this.ctx;

    let result = null;
    try {
      // 上传至OSS
      result = await ctx.oss.put(filename, filelocation);
      // 删除本地文件
      fs.unlinkSync(filelocation);
    } catch (err) {
      this.logger.error('UserService:: uploadBannerImage error: %j', err);
      return 2;
    }

    if (!result) {
      return 3;
    }

    const setStatus = await this.setBannerImage(filename, ctx.user.id);

    if (setStatus !== 0) {
      return 4;
    }

    return 0;
  }

  async setBannerImage(filelocation, userid) {
    try {
      const result = await this.app.mysql.update('users', { banner: filelocation }, { where: { id: userid } });

      if (result.affectedRows >= 1) {
        return 0;
      }
      return 3;


    } catch (err) {
      this.logger.error('UserService:: setBannerImage error: %j', err);
      return 2;
    }
  }

  // 待删除 2019-10-30 chenhao
  // async setNickname(nickname, current_user) {

  //   const sameNickname = await this.app.mysql.query(
  //     'SELECT COUNT(*) AS same_count FROM users WHERE nickname = ?',
  //     [ nickname ]
  //   );

  //   if (sameNickname[0].same_count) {
  //     return nicknameDuplicated;
  //   }
  //   try {
  //     const row = {
  //       nickname,
  //     };

  //     const options = {
  //       where: {
  //         username: current_user,
  //       },
  //     };

  //     const result = await this.app.mysql.update('users', row, options);
  //     return result.affectedRows === 1;
  //   } catch (err) {
  //     this.logger.error('UserService:: setNickname error: %j', err);
  //   }
  //   return false;
  // }

  // EOS: 从链上取得数据, 判断address的合法性
  async isEosAddress(address) {
    const eosClient = EOS({
      chainId: this.ctx.app.config.eos.chainId,
      httpEndpoint: this.ctx.app.config.eos.httpEndpoint,
    });

    try {
      await eosClient.getAccount(address);
      // console.log(accountInfo);
    } catch (err) {
      // 查询的用户不存在时候, 此API会报错, 所以要handle
      this.logger.info('UserService:: isEosAddress: No, info: %j', err);
      return false;
    }
    return true;
  }

  // 已被放弃 ONT: 是A开头的34位字符串,且不含特殊符号,即通过
  // 已被放弃, 符合该条件, 但是非checksumed address 不会被过滤
  // 后面在process_withdraw的时候, 发起交易的时候会出错, 然后该记录status永远为0而且没有trx交易号码
  // async isOntAddress(address) {
  //   if (/^A[0-9a-zA-Z]{33}$/.test(address)) {
  //     return true;
  //   }
  //   return false;
  // }

  async isOntAddress(address) {
    /*
    try {
      const addressVerify = new ONT.Crypto.Address(address);
      await addressVerify.serialize();
    } catch (err) {
      this.logger.info('UserService:: isOntAddress: No, info: %j', err);
      return false;
    }
    */
    return true;
  }

  // 获取我邀请的人的列表
  async invitees(userId, page = 1, pagesize = 20) {
    const totalsql = 'SELECT COUNT(*) AS count FROM users ';
    const listsql = 'SELECT id,username,avatar,create_time FROM users ';
    const wheresql = 'WHERE referral_uid=:userId ';
    const ordersql = 'ORDER BY id DESC LIMIT :start, :end ';

    const sql = totalsql + wheresql + ';' + listsql + wheresql + ordersql + ';';

    const queryResult = await this.app.mysql.query(sql,
      { userId, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    _.each(queryResult[1], row => {
      row.username = this.maskEmailAddress(row.username);
    });

    return { count: queryResult[0][0].count, list: queryResult[1] };
  }

  async saveLinks(userId, websites, socialAccounts) {
    if (userId === null) {
      return false;
    }
    if (!Array.isArray(websites)) {
      return false;
    }
    if (!socialAccounts) {
      return false;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.query('DELETE FROM user_websites WHERE uid = ? AND website_id >= ?', [ userId, websites.length ]);

      let websiteId = 0;

      for (const website of websites) {
        await conn.query('INSERT INTO user_websites VALUES(?, ?, ?) ON DUPLICATE KEY UPDATE url = VALUES(url)', [
          userId,
          websiteId,
          website,
        ]);

        websiteId++;
      }

      const { wechat = null, qq = null, weibo = null, github = null, telegram = null, twitter = null, facebook = null, email = null } = socialAccounts;

      await conn.query(`INSERT INTO user_social_accounts VALUES(?, nullif(?, ''), nullif(?, ''), nullif(?, ''), nullif(?, ''), nullif(?, ''), nullif(?, ''), nullif(?, ''), nullif(?, ''))
        ON DUPLICATE KEY UPDATE
          wechat = VALUES(wechat),
          qq = VALUES(qq),
          weibo = VALUES(weibo),
          github = VALUES(github),
          telegram = VALUES(telegram),
          twitter = VALUES(twitter),
          facebook = VALUES(facebook),
          email = VALUES(email);`, [
        userId,
        wechat,
        qq,
        weibo,
        github,
        telegram,
        twitter,
        facebook,
        email,
      ]);

      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -1;
    }
  }

  async getLinks(userId) {
    if (userId === null) {
      return null;
    }

    const { existence } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM users WHERE id = ?) existence;', [ userId ]))[0];
    if (!existence) {
      return null;
    }

    const websites = [];

    const websiteResults = await this.app.mysql.query('SELECT url FROM user_websites WHERE uid = ?;', [ userId ]);
    for (const { url } of websiteResults) {
      websites.push(url);
    }

    const socialAccounts = [];

    const socialAccountResult = (await this.app.mysql.query('SELECT wechat, qq, weibo, github, telegram, twitter, facebook, email FROM user_social_accounts WHERE uid = ?;', [ userId ]))[0];
    if (socialAccountResult) {
      for (const [ type, value ] of Object.entries(socialAccountResult)) {
        if (!value) {
          continue;
        }

        socialAccounts.push({
          type,
          value,
        });
      }
    }

    return { websites, socialAccounts };
  }

  async getBookmarks(userId, order = 1, page = 1, pagesize = 20, channel_id = 1) {
    if (userId === null) {
      return false;
    }

    if (typeof order === 'string') {
      order = parseInt(order);
    }

    let sql = `SELECT pid
      FROM post_bookmarks b
      JOIN posts p ON p.id = pid
      JOIN users u ON u.id = p.uid
      WHERE b.uid = :userId AND p.channel_id = :channel_id `;

    if (order === 1) {
      sql += `
        ORDER BY b.create_time DESC`;
    } else if (order === 2) {
      sql += `
        ORDER BY p.create_time`;
    } else {
      return false;
    }

    sql += ` LIMIT :offset, :limit;
      SELECT count(1) AS count FROM post_bookmarks b
      JOIN posts p ON p.id = pid
      WHERE b.uid = :userId AND p.channel_id = :channel_id;`;

    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      userId,
      channel_id,
    });
    const { count } = result[1][0];

    return {
      count,
      list: await this.service.post.getByPostIds(result[0].map(row => row.pid)),
    };
  }
  async getBookmarkStats(userId) {
    if (userId === null) {
      return false;
    }

    const { articleCount } = (await this.app.mysql.query('SELECT count(1) AS articleCount FROM post_bookmarks WHERE uid = ?;', [ userId ]))[0];

    return {
      articleCount,
    };
  }

  maskEmailAddress(str) {
    if (typeof str !== 'string') {
      return null;
    }

    let result = maskedEmailCache.get(str);
    if (result) {
      return result;
    }

    // Source: https://html.spec.whatwg.org/multipage/input.html#e-mail-state-(type=email)
    const regex = /^([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+)@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const match = regex.exec(str);

    if (!match) {
      maskedEmailCache.set(str, str);
      return str;
    }

    let username = match[1];
    const rest = str.slice(username.length);

    switch (username.length) {
      case 1:
        username = '*';
        break;

      case 2:
        username = username[0] + '*';
        break;

      case 3:
        username = username[0] + '*' + username[2];
        break;

      default:
        const trunkSize = username.length / 4;
        const firstSize = Math.max(Math.floor(trunkSize), 1);
        const secondSize = Math.ceil(trunkSize * 2);
        username = username.slice(0, firstSize) + '*'.repeat(secondSize) + username.slice(firstSize + secondSize);
        break;
    }

    result = username + rest;

    maskedEmailCache.set(str, result);

    return result;
  }
}

module.exports = UserService;
