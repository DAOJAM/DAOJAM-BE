/* eslint-disable no-bitwise */
'use strict';
const consts = require('./consts');

const Service = require('egg').Service;
const _ = require('lodash');
const moment = require('moment');
const fs = require('fs');
const removemd = require('remove-markdown');
// const IpfsHttpClientLite = require('ipfs-http-client-lite');
const { articleToHtml } = require('markdown-article-to-html');


class PostService extends Service {

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

  // 洗去内容的md和html标签， 还有空格和换行等不显示字符
  async wash(rawContent) {
    let parsedContent = rawContent;
    // 去除markdown图片链接
    parsedContent = parsedContent.replace(/!\[.*?\]\((.*?)\)/gi, '');
    // 去除video标签
    parsedContent = parsedContent.replace(/<video.*?>\n*?.*?\n*?<\/video>/gi, '');
    parsedContent = parsedContent.replace(/<[^>]+>/gi, '');
    // 去除audio标签
    parsedContent = parsedContent.replace(/<audio.*?>\n*?.*?\n*?<\/audio>/gi, '');
    parsedContent = parsedContent.replace(/<[^>]+>/gi, '');
    // 去除source标签
    parsedContent = parsedContent.replace(/<source.*?>\n*?.*?\n*?<\/source>/gi, '');
    parsedContent = parsedContent.replace(/<[^>]+>/gi, '');
    // parsedContent = parsedContent.substring(0, 600);
    // 去除markdown和html
    parsedContent = removemd(parsedContent);
    // 去除空格
    parsedContent = parsedContent.replace(/\s+/g, '');
    // parsedContent = parsedContent.substring(0, 300);
    return parsedContent;
  }

  async publish(data, { metadataHash, htmlHash }) {
    try {
      const result = await this.app.mysql.insert('posts', data);

      if (result.affectedRows === 1) {
        // 创建统计表栏目
        await this.app.mysql.query(
          'INSERT INTO post_read_count(post_id, real_read_count, sale_count, support_count, eos_value_count, ont_value_count)'
          + ' VALUES(?, 0, 0, 0 ,0, 0);',
          [ result.insertId ]
        );

        // await this.app.redis.multi()
        //   .sadd('post', result.insertId)
        //   .hincrby('post:stat', 'count', 1)
        //   .zadd('post:hot:filter:1', 0, result.insertId)
        //   .exec();

        // 加积分
        await this.service.mining.publish(data.uid, result.insertId, ''); // todo；posts表增加ip，这里传进来ip
        // 添加 IPFS 记录
        await this.app.mysql.insert('post_ipfs',
          { articleId: result.insertId, metadataHash, htmlHash }
        );
        return result.insertId;
      }
    } catch (err) {
      this.logger.error('PostService::publish error: %j', err);
    }

    return 0;
  }

  async create_tags(sid, tag_arr, replace) {
    try {
      // 重置文章的标签
      if (replace) {
        await this.app.mysql.delete('post_tag', { sid });
      }

      for (let i = 0; i < tag_arr.length; i++) {
        const id = tag_arr[i];
        const tag = await this.app.mysql.get('tags', { id });
        if (tag) {
          await this.app.mysql.insert('post_tag', { sid, tid: tag.id });
        }
      }
    } catch (err) {
      this.logger.error('PostService::create_tags error: %j', err);
    }
  }

  // 根据hash获取文章
  async getByHash(hash, requireProfile) {
    const posts = await this.app.mysql.query(
      'SELECT id, username, author, title, short_content, hash, status, onchain_status, create_time, fission_factor, '
      + 'cover, is_original, channel_id, fission_rate, referral_rate, uid, is_recommend, category_id, comment_pay_point, require_holdtokens, require_buy FROM posts WHERE hash = ?;',
      [ hash ]
    );
    let post = posts[0];
    if (!post) {
      return null;
    }

    if (requireProfile) {
      post = await this.getPostProfile(post);
    }
    post.tokens = await this.getMineTokens(post.id);
    post.username = this.service.user.maskEmailAddress(post.username);
    return post;
  }

  // 根据id获取文章-简单版
  async get(id) {
    const posts = await this.app.mysql.select('posts', {
      where: { id },
      columns: [ 'id', 'hash', 'cover', 'uid', 'title', 'short_content', 'status', 'create_time', 'comment_pay_point', 'channel_id', 'require_buy' ], // todo：需要再增加
    });
    if (posts && posts.length > 0) {
      return posts[0];
    }
    return null;
  }
  async getById2(id) {
    const posts = await this.app.mysql.query(
      `SELECT p.*,
      u.username, u.nickname, u.platform, u.avatar,
      prc.real_read_count, prc.likes, prc.dislikes
      FROM posts p
      LEFT JOIN users u
      ON p.uid = u.id
      LEFT JOIN post_read_count prc
      ON p.id = prc.post_id
      WHERE p.id = ?;`,
      [ id ]
    );

    if (posts === null || posts.length === 0) {
      return null;
    }

    const post = posts[0];
    return post;
  }

  // 根据id获取文章
  /*
  查询太多影响性能，修改计划：
    把公共属性和持币阅读权限放到一起返回
    其他和当前登录相关的属性放入新接口返回
  */
  async getById(id) {
    const posts = await this.app.mysql.query(
      'SELECT id, username, author, title, short_content, hash, status, onchain_status, create_time, fission_factor, '
      + 'cover, is_original, channel_id, fission_rate, referral_rate, uid, is_recommend, category_id, comment_pay_point, require_holdtokens, require_buy, cc_license FROM posts WHERE id = ?;',
      [ id ]
    );

    if (posts === null || posts.length === 0) {
      return null;
    }

    let post = posts[0];
    post = await this.getPostProfile(post);
    post.tokens = await this.getMineTokens(id);
    post.username = this.service.user.maskEmailAddress(post.username);
    return post;
  }

  async getForEdit(id, current_user) {
    const posts = await this.app.mysql.query(
      'SELECT id, username, author, title, short_content, hash, status, onchain_status, create_time, fission_factor, '
      + 'cover, is_original, channel_id, fission_rate, referral_rate, uid, is_recommend, category_id, comment_pay_point, require_holdtokens FROM posts WHERE id = ? AND uid = ?;',
      [ id, current_user ]
    );

    if (posts === null || posts.length === 0) {
      return null;
    }

    let post = posts[0];
    post = await this.getPostProfile(post);
    post.tokens = await this.getMineTokens(id);
    post.username = this.service.user.maskEmailAddress(post.username);
    return post;
  }

  // 获取文章阅读数等属性
  async getPostProfile(post) {
    // 如果是商品，返回价格
    post.prices = await this.getPrices(post.id);

    // 阅读次数
    const count = await this.app.mysql.query(
      'SELECT post_id AS id, real_read_count AS num, sale_count AS sale, support_count AS ups, eos_value_count AS eosvalue, ont_value_count AS ontvalue, likes, dislikes'
      + ' FROM post_read_count WHERE post_id = ?;',
      [ post.id ]
    );
    if (count.length) {
      post.read = count[0].num;
      post.sale = count[0].sale;
      post.ups = count[0].ups;
      post.value = count[0].eosvalue;
      post.ontvalue = count[0].ontvalue;
      post.likes = count[0].likes;
      post.dislikes = count[0].dislikes;
    } else {
      post.read = post.sale = post.ups = post.value = post.ontvalue = post.likes = post.dislikes = 0;
    }

    // tags
    const tags = await this.app.mysql.query(
      'select a.id, a.name from tags a left join post_tag b on a.id = b.tid where b.sid = ? ',
      [ post.id ]
    );

    post.tags = tags;

    // nickname
    const user = await this.service.user.get(post.uid); // this.app.mysql.get('users', { username: name });
    if (user) {
      post.nickname = user.nickname;
    }

    // update cahce
    // this.app.read_cache[post.id] = post.read;
    // this.app.value_cache[post.id] = post.value;
    // this.app.ups_cache[post.id] = post.ups;

    // this.app.post_cache[post.id] = post;

    return post;
  }

  // 登录用户查看与自己相关的属性
  async getPostProfileOf(id, userId) {
    if (!userId) {
      return null;
    }

    const post = await this.get(id);
    if (!post) {
      return null;
    }

    post.holdMineTokens = await this.getHoldMineTokens(id, userId);

    // 当前用户是否已赞赏
    post.is_support = false;
    const support = await this.app.mysql.get('supports', { signid: post.id, uid: userId, status: 1 });
    if (support) {
      post.is_support = true;
    }

    // 如果是商品，判断当前用户是否已购买
    if (post.channel_id === consts.postChannels.product) {
      post.is_buy = false;
      const buy = await this.app.mysql.get('orders', { signid: post.id, uid: userId, status: 1 });
      if (buy) {
        post.is_buy = true;
      }
    }

    // 如果是文章，并且需要购买，判断当前用户是否已购买
    if (post.channel_id === consts.postChannels.article && post.require_buy === 1) {
      post.is_buy = false;
      const buy = await this.service.shop.order.isBuy(id, userId);
      if (buy) {
        post.is_buy = true;
      }
    }

    // 是否点过推荐/不推荐，每个人只能点一次推荐/不推荐
    post.is_liked = await this.service.mining.liked(userId, post.id);
    // 获取用户从单篇文章阅读获取的积分
    post.points = await this.service.mining.getPointslogBySignId(userId, post.id);

    // 判断3天内的文章是否领取过阅读新文章奖励，3天以上的就不查询了
    if ((Date.now() - post.create_time) / (24 * 3600 * 1000) <= 3) {
      post.is_readnew = await this.service.mining.getReadNew(userId, post.id);
    }

    // 是否收藏
    const { isBookmarked } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM post_bookmarks WHERE uid = ? AND pid = ?) isBookmarked;', [ userId, id ]))[0];
    post.is_bookmarked = isBookmarked;

    return post;
  }

  // 获取商品价格
  async getPrices(signId) {
    const prices = await this.app.mysql.select('product_prices', {
      where: { sign_id: signId, status: 1 },
      columns: [ 'platform', 'symbol', 'price', 'decimals', 'stock_quantity' ],
    });

    return prices;
  }

  // 获取我关注的作者的文章
  async followedPosts(page = 1, pagesize = 20, userid = null, channel = null, extra = null, filter = 0) {

    if (userid === null) {
      return 2;
    }

    const totalsql = 'SELECT COUNT(*) AS count FROM posts p INNER JOIN follows f ON f.fuid = p.uid AND f.status = 1 ';
    const listsql = 'SELECT p.id AS signid FROM posts p INNER JOIN follows f ON f.fuid = p.uid AND f.status = 1 ';
    const ordersql = 'ORDER BY p.id DESC LIMIT :start, :end';
    let wheresql = 'WHERE f.uid = :uid AND p.status = 0 ';

    const channelid = parseInt(channel);
    if (channel) {
      if (isNaN(channelid)) {
        return 2;
      }
      wheresql += 'AND p.channel_id = ' + channelid + ' ';
    }

    if (typeof filter === 'string') filter = parseInt(filter);

    if (filter > 0) {
      const conditions = [];

      // 免费
      if ((filter & 1) > 0) {
        conditions.push('(require_holdtokens = 0 AND require_buy = 0)');
      }

      // 持币阅读
      if ((filter & 2) > 0) {
        conditions.push('require_holdtokens = 1');
      }

      // 需要购买
      if ((filter & 4) > 0) {
        conditions.push('require_buy = 1');
      }

      wheresql += 'AND (' + conditions.join(' OR ') + ') ';
    }

    const sqlcode = totalsql + wheresql + ';' + listsql + wheresql + ordersql + ';';
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { uid: userid, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];
    const posts = queryResult[1];

    const postids = [];
    _.each(posts, row => {
      postids.push(row.signid);
    });

    const extraItem = {};
    if (extra) {
      const extraSplit = extra.split(',');
      _.each(extraSplit, row => {
        if (row === 'short_content') {
          extraItem.short_content = true;
        }
      });
    }


    if (postids.length === 0) {
      // return [];
      return { count: 0, list: [] };
    }

    const postList = await this.getPostList(postids, extraItem);

    return { count: amount[0].count, list: postList };

  }

  async scoreRank(page = 1, pagesize = 20, filter = 7) {
    let count, ids;

    if ((filter & 6) === 6 && !await this.app.redis.exists('post:hot:filter:6')) {
      await this.app.redis.pipeline()
        .zinterstore('post:hot:filter:6_common', 2, 'post:hot:filter:2', 'post:hot:filter:4', 'WEIGHTS', 1, 0)
        .expire('post:hot:filter:6_common', 10)
        .zunionstore('post:hot:filter:6', 3, 'post:hot:filter:2', 'post:hot:filter:4', 'post:hot:filter:6_common', 'WEIGHTS', 1, 1, -1)
        .expire('post:hot:filter:6', 300)
        .exec();
    }

    if (filter === 6) {
      ids = await this.app.redis.zrevrange('post:hot:filter:6', (page - 1) * pagesize, page * pagesize - 1);
      count = Number(await this.app.redis.zcard('post:hot:filter:6'));
    } else {
      const keys = new Set();
      // 免费
      if ((filter & 1) > 0) keys.add('post:hot:filter:1');

      if ((filter & 6) === 6) {
        keys.add('post:hot:filter:6');
      } else {
        // 持币阅读
        if ((filter & 2) > 0) keys.add('post:hot:filter:2');
        // 需要购买
        if ((filter & 4) > 0) keys.add('post:hot:filter:4');
      }

      if (keys.size === 1) {
        const key = Array.from(keys)[0];

        ids = await this.app.redis.zrevrange(key, (page - 1) * pagesize, page * pagesize - 1);
        count = Number(await this.app.redis.zcard(key));
      } else {
        const key = 'post:hot:filter:' + filter;

        if (await this.app.redis.exists(key)) {
          ids = await this.app.redis.zrevrange(key, (page - 1) * pagesize, page * pagesize - 1);
        } else {
          const pipeline = this.app.redis.multi();
          pipeline.zunionstore(key, keys.size, Array.from(keys)).zrevrange(key, (page - 1) * pagesize, page * pagesize - 1);
          pipeline.expire(key, 300);

          const resultSet = await pipeline.exec();
          ids = resultSet[1][1];
        }

        count = Number(await this.app.redis.zcard(key));
      }
    }

    ids = ids.map(id => Number(id));

    return { count, list: await this.getPostList(ids) };
  }
  // 推荐分数排序(默认方法)(new format)(count-list格式)
  async scoreRankSlow_backup(page = 1, pagesize = 20, author = null, channel = null, extra = null, filter = 0) {

    // 获取文章列表, 分为商品文章和普通文章
    // 再分为带作者和不带作者的情况.

    const totalsql = 'SELECT COUNT(*) AS count FROM posts ';
    let wheresql = 'WHERE status = 0 ';

    if (author) {
      wheresql += 'AND uid = :author ';
    }
    const channelid = parseInt(channel);
    if (channel !== null) {
      if (isNaN(channelid)) {
        return 2;
      }
      wheresql += 'AND channel_id = ' + channelid + ' ';
    }

    if (typeof filter === 'string') filter = parseInt(filter);

    if (filter > 0) {
      const conditions = [];

      // 免费
      if ((filter & 1) > 0) {
        conditions.push('(require_holdtokens = 0 AND require_buy = 0)');
      }

      // 持币阅读
      if ((filter & 2) > 0) {
        conditions.push('require_holdtokens = 1');
      }

      // 需要购买
      if ((filter & 4) > 0) {
        conditions.push('require_buy = 1');
      }

      wheresql += 'AND (' + conditions.join(' OR ') + ') ';
    }
    const postids = await this.service.hot.list(page, pagesize, 1);

    const sqlcode = totalsql + wheresql + ';';
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { author, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];

    if (postids.length === 0) {
      return { count: 0, list: [] };
    }

    const extraItem = {};
    if (extra) {
      const extraSplit = extra.split(',');
      _.each(extraSplit, row => {
        if (row === 'short_content') {
          extraItem.short_content = true;
        }
      });
    }

    const postList = await this.getPostList(postids, extraItem);

    return { count: amount.count, list: postList };
  }
  // 推荐分数排序(默认方法)(new format)(count-list格式)
  async scoreRankSlow(page = 1, pagesize = 20, channel = 1) {
    const postids = await this.service.hot.list(page, pagesize, channel);
    if (postids === null || postids.length <= 0) {
      return {
        count: 0,
        list: [],
      };
    }
    const sql = `SELECT a.id, a.uid, a.author, a.title, a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, a.short_content,
      b.nickname, b.avatar, 
      c.real_read_count AS \`read\`, c.likes,

      t5.platform as pay_platform, t5.symbol as pay_symbol, t5.price as pay_price, t5.decimals as pay_decimals, t5.stock_quantity as pay_stock_quantity,
      t7.id as token_id, t6.amount as token_amount, t7.name as token_name, t7.symbol as token_symbol, t7.decimals  as token_decimals

      FROM posts a
      LEFT JOIN users b ON a.uid = b.id 
      LEFT JOIN post_read_count c ON a.id = c.post_id 

      LEFT JOIN product_prices t5
      ON a.id = t5.sign_id
      LEFT JOIN post_minetokens t6
      ON a.id = t6.sign_id
      LEFT JOIN minetokens t7
      ON t7.id = t6.token_id 

      WHERE a.id IN (:postids)
      ORDER BY FIELD(a.id, :postids);
      
      SELECT COUNT(*) AS count FROM posts a
      WHERE a.\`status\` = 0 AND a.channel_id = :channel;`;

    const queryResult = await this.app.mysql.query(
      sql,
      { start: (page - 1) * pagesize, end: 1 * pagesize, postids, channel }
    );

    const posts = queryResult[0];
    const amount = queryResult[1];

    if (posts.length === 0) {
      return { count: 0, list: [] };
    }

    const len = posts.length;
    const id2posts = {};
    for (let i = 0; i < len; i++) {
      const row = posts[i];
      row.tags = [];
      id2posts[row.id] = row;
      postids.push(row.id);
    }
    const tagSql = 'SELECT p.sid, p.tid, t.name, t.type FROM post_tag p LEFT JOIN tags t ON p.tid = t.id WHERE sid IN (:signid);';

    const tagResult = await this.app.mysql.query(
      tagSql,
      { signid: postids }
    );
    const tagResultLen = tagResult.length;
    for (let i = 0; i < tagResultLen; i++) {
      const row = tagResult[i];
      const id = row.sid;
      id2posts[id].tags.push({
        id: row.tid, name: row.name, type: row.type,
      });
    }
    // Frank - 这里要展开屏蔽邮箱地址的魔法了
    const emailMask = str => str.replace(
      /(?<=.)[^@\n](?=[^@\n]*?@)|(?:(?<=@.)|(?!^)\G(?=[^@\n]*$)).(?=.*\.)/gm,
      '*');
    const list = posts.map(post => {
      const author = emailMask(post.author);
      return { ...post, author };
    });
    return { count: amount[0].count, list };
  }

  // 发布时间排序()(new format)(count-list格式)
  async timeRank(page = 1, pagesize = 20, filter = 7) {
    const key = `post:time:filter:${filter}:${(page - 1) * pagesize}-${page * pagesize - 1}`;

    const count = await this.app.redis.zcard(`post:hot:filter:${filter}`);

    let ids = await this.app.redis.lrange(key, 0, pagesize - 1);
    if (ids.length === 0) {

      const conditions = [];
      // 免费
      if ((filter & 1) > 0) conditions.push('(require_holdtokens = 0 AND require_buy = 0)');
      // 持币阅读
      if ((filter & 2) > 0) conditions.push('require_holdtokens = 1');
      // 需要购买
      if ((filter & 4) > 0) conditions.push('require_buy = 1');

      const sql = `SELECT id FROM posts WHERE status = 0 AND channel_id = 1 AND (${conditions.join(' OR ')}) ORDER BY time_down ASC, id DESC LIMIT :start, :end;`;

      ids = (await this.app.mysql.query(sql, { start: (page - 1) * pagesize, end: 1 * pagesize })).map(row => row.id);

      await this.app.redis.multi()
        .rpush(key, ids)
        .expire(key, 300)
        .exec();
    }

    return { count, list: await this.getPostList(ids) };
  }
  async timeRankSlow(page = 1, pagesize = 20, author = null, channel = null, filter = 0) {

    // 获取文章列表, 分为商品文章和普通文章
    // 再分为带作者和不带作者的情况.
    let wheresql = 'WHERE a.\`status\` = 0 AND a.channel_id = :channel ';
    if (author) wheresql += ' AND a.uid = :author ';

    if (typeof filter === 'string') filter = parseInt(filter);

    if (filter > 0) {
      const conditions = [];
      // 免费
      if ((filter & 1) > 0) {
        conditions.push('(require_holdtokens = 0 AND require_buy = 0)');
      }
      // 持币阅读
      if ((filter & 2) > 0) {
        conditions.push('require_holdtokens = 1');
      }
      // 需要购买
      if ((filter & 4) > 0) {
        conditions.push('require_buy = 1');
      }
      wheresql += 'AND (' + conditions.join(' OR ') + ') ';
    }

    const sql = `SELECT a.id, a.uid, a.author, a.title, a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, a.short_content,
      b.nickname, b.avatar, 
      c.real_read_count AS \`read\`, c.likes,
      t5.platform as pay_platform, t5.symbol as pay_symbol, t5.price as pay_price, t5.decimals as pay_decimals, t5.stock_quantity as pay_stock_quantity,
      t7.id as token_id, t6.amount as token_amount, t7.name as token_name, t7.symbol as token_symbol, t7.decimals  as token_decimals

      FROM posts a
      LEFT JOIN users b ON a.uid = b.id 
      LEFT JOIN post_read_count c ON a.id = c.post_id 
      LEFT JOIN product_prices t5
      ON a.id = t5.sign_id
      LEFT JOIN post_minetokens t6
      ON a.id = t6.sign_id
      LEFT JOIN minetokens t7
      ON t7.id = t6.token_id 

      ${wheresql} 
      ORDER BY a.time_down ASC, a.id DESC LIMIT :start, :end;
      SELECT COUNT(*) AS count FROM posts a
      ${wheresql};`;
    const queryResult = await this.app.mysql.query(
      sql,
      { author, start: (page - 1) * pagesize, end: 1 * pagesize, channel }
    );

    const posts = queryResult[0];
    const amount = queryResult[1];

    if (posts.length === 0) {
      return { count: 0, list: [] };
    }
    const postids = [];
    const len = posts.length;
    const id2posts = {};
    for (let i = 0; i < len; i++) {
      const row = posts[i];
      row.tags = [];
      id2posts[row.id] = row;
      postids.push(row.id);
    }
    const tagSql = 'SELECT p.sid, p.tid, t.name, t.type FROM post_tag p LEFT JOIN tags t ON p.tid = t.id WHERE sid IN (:signid);';

    const tagResult = await this.app.mysql.query(
      tagSql,
      { signid: postids }
    );
    const tagResultLen = tagResult.length;
    for (let i = 0; i < tagResultLen; i++) {
      const row = tagResult[i];
      const id = row.sid;
      id2posts[id].tags.push({
        id: row.tid, name: row.name, type: row.type,
      });
    }
    // Frank - 这里要展开屏蔽邮箱地址的魔法了
    const emailMask = str => str.replace(
      /(?<=.)[^@\n](?=[^@\n]*?@)|(?:(?<=@.)|(?!^)\G(?=[^@\n]*$)).(?=.*\.)/gm,
      '*');
    const list = posts.map(post => {
      const author = emailMask(post.author);
      return { ...post, author };
    });
    return { count: amount[0].count, list };
  }
  async getByPostIds(postids = []) {
    if (postids === null || postids.length <= 0) {
      return [];
    }
    const sql = `SELECT a.id, a.uid, a.author, a.title, a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, a.short_content,
      b.nickname, b.avatar, 
      c.real_read_count AS \`read\`, c.likes,

      t5.platform as pay_platform, t5.symbol as pay_symbol, t5.price as pay_price, t5.decimals as pay_decimals, t5.stock_quantity as pay_stock_quantity,
      t7.id as token_id, t6.amount as token_amount, t7.name as token_name, t7.symbol as token_symbol, t7.decimals  as token_decimals

      FROM posts a
      LEFT JOIN users b ON a.uid = b.id 
      LEFT JOIN post_read_count c ON a.id = c.post_id 

      LEFT JOIN product_prices t5
      ON a.id = t5.sign_id
      LEFT JOIN post_minetokens t6
      ON a.id = t6.sign_id
      LEFT JOIN minetokens t7
      ON t7.id = t6.token_id 

      WHERE a.id IN (:postids)
      ORDER BY FIELD(a.id, :postids);`;

    const queryResult = await this.app.mysql.query(
      sql,
      { postids }
    );

    const posts = queryResult;

    if (posts.length === 0) {
      return { count: 0, list: [] };
    }

    const len = posts.length;
    const id2posts = {};
    for (let i = 0; i < len; i++) {
      const row = posts[i];
      row.tags = [];
      id2posts[row.id] = row;
      postids.push(row.id);
    }
    const tagSql = 'SELECT p.sid, p.tid, t.name, t.type FROM post_tag p LEFT JOIN tags t ON p.tid = t.id WHERE sid IN (:signid);';

    const tagResult = await this.app.mysql.query(
      tagSql,
      { signid: postids }
    );
    const tagResultLen = tagResult.length;
    for (let i = 0; i < tagResultLen; i++) {
      const row = tagResult[i];
      const id = row.sid;
      id2posts[id].tags.push({
        id: row.tid, name: row.name, type: row.type,
      });
    }
    // Frank - 这里要展开屏蔽邮箱地址的魔法了
    const emailMask = str => str.replace(
      /(?<=.)[^@\n](?=[^@\n]*?@)|(?:(?<=@.)|(?!^)\G(?=[^@\n]*$)).(?=.*\.)/gm,
      '*');
    const list = posts.map(post => {
      const author = emailMask(post.author);
      return { ...post, author };
    });
    return list;
  }

  // (new format)(count-list格式)
  async getPostByTag(page = 1, pagesize = 20, extra = null, tagid) {

    const totalsql = 'SELECT COUNT(*) AS count FROM post_tag a LEFT JOIN posts b ON a.sid = b.id ';
    const listsql = 'SELECT a.sid, a.tid, b.title FROM post_tag a LEFT JOIN posts b ON a.sid = b.id ';
    const wheresql = 'WHERE a.tid = :tid AND b.status = 0 ';
    const ordersql = 'ORDER BY b.id DESC LIMIT :start, :end';

    const sqlcode = totalsql + wheresql + ';' + listsql + wheresql + ordersql + ';';
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { tid: tagid, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];
    const posts = queryResult[1];

    // 将文章id转为Array
    const postids = [];
    _.each(posts, row => {
      postids.push(row.sid);
    });

    if (postids.length === 0) {
      // return [];
      return { count: 0, list: [] };
    }

    const extraItem = {};
    if (extra) {
      const extraSplit = extra.split(',');
      _.each(extraSplit, row => {
        if (row === 'short_content') {
          extraItem.short_content = true;
        }
      });
    }

    const postList = await this.getPostList(postids, extraItem);

    return { count: amount[0].count, list: postList };
  }

  // 赞赏次数排序(new format)(count-list格式)
  async supportRank(page = 1, pagesize = 20, channel = null, extra = null) {

    const totalsql = 'SELECT COUNT(*) AS count FROM posts p ';
    const listsql = 'SELECT p.id, c.support_count FROM posts p LEFT JOIN post_read_count c ON c.post_id = p.id ';
    let wheresql = 'WHERE p.status = 0 ';
    const ordersql = 'ORDER BY c.support_count DESC, p.id DESC LIMIT :start, :end';
    // 获取文章id列表, 按照统计表的赞赏次数排序
    const channelid = parseInt(channel);
    if (channel !== null) {
      if (isNaN(channelid)) {
        return 2;
      }
      wheresql += 'AND p.channel_id = ' + channelid + ' ';
    }
    const sqlcode = totalsql + wheresql + ';' + listsql + wheresql + ordersql + ';';
    // 在support表中, 由赞赏次数获得一个文章的排序, 并且已经确保文章是没有被删除的
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];
    const posts = queryResult[1];

    // 将文章id转为Array
    const postids = [];
    _.each(posts, row => {
      postids.push(row.id);
    });

    if (postids.length === 0) {
      // return [];
      return { count: 0, list: [] };
    }

    const extraItem = {};
    if (extra) {
      const extraSplit = extra.split(',');
      _.each(extraSplit, row => {
        if (row === 'short_content') {
          extraItem.short_content = true;
        }
      });
    }

    let postList = await this.getPostList(postids, extraItem);

    // 由赞赏次数进行排序
    // 还没加上时间降序
    postList = postList.sort((a, b) => {
      if (a.ups === b.ups) {
        return a.id > b.id ? -1 : 1;
      }
      return a.ups > b.ups ? -1 : 1;
    });

    return { count: amount[0].count, list: postList };
  }

  // 分币种的赞赏金额排序
  // 请注意因为"后筛选"导致的不满20条,进而前端无法加载的问题.
  // 暂时不使用， 因此没有维护
  async amountRank(page = 1, pagesize = 20, symbol = 'EOS', channel = null) {

    let posts = null;
    let sqlcode = '';

    // 获取文章id列表, 按照指定的币种赞赏金额排序
    if (symbol.toUpperCase() === 'EOS') {
      sqlcode = 'SELECT p.id, c.eos_value_count AS count ';
    } else {
      sqlcode = 'SELECT p.id, c.ont_value_count AS count ';
    }
    sqlcode += 'FROM posts p '
      + 'LEFT JOIN post_read_count c ON c.post_id = p.id '
      + 'WHERE p.status = 0 ';
    const channelid = parseInt(channel);
    if (channel !== null) {
      if (isNaN(channelid)) {
        return 2;
      }
      sqlcode += 'AND p.channel_id = ' + channelid + ' ';
    }
    sqlcode += 'ORDER BY count DESC, p.id DESC LIMIT :start, :end;';
    posts = await this.app.mysql.query(
      sqlcode,
      { start: (page - 1) * pagesize, end: 1 * pagesize, symbol: symbol.toUpperCase() }
    );

    // 将文章id转为Array
    const postids = [];
    _.each(posts, row => {
      postids.push(row.id);
    });

    if (postids.length === 0) {
      return [];
      // return { count: 0, list: [] };
    }

    // 调用getPostList函数获得文章的具体信息
    // 此时序列已经被打乱了
    let postList = await this.getPostList(postids);

    // 重新由赞赏金额进行排序
    // 还没加上时间降序
    switch (symbol.toUpperCase()) {
      case 'EOS':
        postList = postList.sort((a, b) => {
          if (a.eosvalue === b.eosvalue) {
            return a.id > b.id ? -1 : 1;
          }
          return a.eosvalue > b.eosvalue ? -1 : 1;
        });
        break;

      case 'ONT':
        postList = postList.sort((a, b) => {
          if (a.ontvalue === b.ontvalue) {
            return a.id > b.id ? -1 : 1;
          }
          return a.ontvalue > b.ontvalue ? -1 : 1;
        });
        break;
    }

    return postList;
  }

  // 获取用户赞赏过的文章(new format)(count-list格式)
  async supportedPosts(page = 1, pagesize = 20, userid = null, channel = null) {

    // 没写用户
    if (userid === null) {
      return 2;
    }

    const totalsql = 'SELECT COUNT(*) AS count FROM supports s INNER JOIN posts p ON s.signid = p.id ';
    const listsql = 'SELECT s.create_time, signid FROM supports s INNER JOIN posts p ON s.signid = p.id ';
    const ordersql = 'ORDER BY s.create_time DESC LIMIT :start, :end';
    let wheresql = 'WHERE s.status = 1 AND p.status = 0 AND s.uid = :uid ';

    const channelid = parseInt(channel);
    if (channel) {
      if (isNaN(channelid)) {
        return 2;
      }
      wheresql += 'AND p.channel_id = ' + channelid + ' ';
    }

    const sqlcode = totalsql + wheresql + ';' + listsql + wheresql + ordersql + ';';
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { uid: userid, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];
    const posts = queryResult[1];

    const postids = [];
    _.each(posts, row => {
      postids.push(row.signid);
    });

    if (postids.length === 0) {
      // return [];
      return { count: 0, list: [] };
    }

    let postList = await this.getPostList(postids);

    _.each(postList, row2 => {
      _.each(posts, row => {
        if (row.signid === row2.id) {
          row2.support_time = row.create_time;
        }
      });
    });

    postList = postList.sort((a, b) => {
      return b.id - a.id;
    });

    return { count: amount[0].count, list: postList };
  }

  async recommendPosts(amount = 5) {
    let ids = await this.app.redis.zrevrange('post:recommend', 0, amount);
    if (ids.length === 0) {
      ids = (await this.app.mysql.query('SELECT id FROM posts WHERE is_recommend = 1 AND status = 0 AND channel_id = 1;')).map(row => row.id);

      const pipeline = this.app.redis.multi();
      for (const id of ids) {
        pipeline.zadd('post:recommend', id, id);
      }
      await pipeline.expire('post:recommend', 300).exec();

      ids = await this.app.redis.zrevrange('post:recommend', 0, amount);
    }

    return await this.getPostList(ids);
  }
  async recommendPostsSlow(channel = null, amount = 5) {

    let sqlcode = '';
    sqlcode = 'SELECT id FROM posts '
      + 'WHERE is_recommend = 1 AND status = 0 ';
    const channelid = parseInt(channel);
    if (channel !== null) {
      if (isNaN(channelid)) {
        return 2;
      }
      sqlcode += 'AND channel_id = ' + channelid + ' ';
    }
    sqlcode += 'ORDER BY id DESC LIMIT :amountnum;';
    const amountnum = parseInt(amount);
    if (isNaN(amountnum)) {
      return 2;
    }
    const posts = await this.app.mysql.query(
      sqlcode,
      { amountnum }
    );

    const postids = [];
    _.each(posts, row => {
      postids.push(row.id);
    });

    if (postids.length === 0) {
      return [];
      // return { count: 0, list: [] };
    }

    const postList = await this.getPostList(postids);

    return postList;
  }

  // 获取文章的列表, 用于成片展示文章时, 会被其他函数调用
  async getPostList(signids, extraItem = null) {

    let postList = [];

    if (signids.length === 0) {
      return postList;
    }
    // 查询文章和作者的信息, 结果是按照时间排序
    // 如果上层也需要按照时间排序的, 则无需再排, 需要其他排序方式则需再排
    let sqlcode = 'SELECT a.id, a.uid, a.author, a.title,';
    if (extraItem) {
      if (extraItem.short_content) {
        sqlcode += ' a.short_content,';
      }
    }

    sqlcode += ' a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, b.nickname, b.avatar FROM posts a';
    sqlcode += ' LEFT JOIN users b ON a.uid = b.id WHERE a.id IN (:signids) AND a.status = 0 ORDER BY FIELD(a.id, :signids);';
    postList = await this.app.mysql.query(
      sqlcode,
      { signids }
    );

    const hashs = [];

    // 准备需要返回的数据
    _.each(postList, row => {
      row.read = 0;
      row.eosvalue = 0;
      row.ups = 0;
      row.ontvalue = 0;
      row.tags = [];
      hashs.push(row.hash);
    });

    // 有关阅读次数,赞赏金额,赞赏次数的统计
    // 还有产品信息， 标签
    const statsQuery = await this.app.mysql.query(
      'SELECT post_id AS id, real_read_count AS num, sale_count AS sale, support_count AS ups, eos_value_count AS eosvalue, ont_value_count AS ontvalue, likes'
      + ' FROM post_read_count WHERE post_id IN (:signid);'
      + 'SELECT sign_id, symbol, price, decimals FROM product_prices WHERE sign_id IN (:signid);'
      + 'SELECT p.sid, p.tid, t.name, t.type FROM post_tag p LEFT JOIN tags t ON p.tid = t.id WHERE sid IN (:signid);',
      { signid: signids }
    );

    const stats = statsQuery[0];
    const products = statsQuery[1];
    const tags = statsQuery[2];

    // 分配数值到每篇文章
    _.each(postList, row => {
      // 基础统计数据
      _.each(stats, row2 => {
        if (row.id === row2.id) {
          row.read = row2.num;
          row.sale = row2.sale;
          row.eosvalue = row2.eosvalue;
          row.ups = row2.ups;
          row.ontvalue = row2.ontvalue;
          row.likes = row2.likes;
        }
      });
      // 如果有标签的话，其标签数据
      _.each(tags, row4 => {
        if (row.id === row4.sid) {
          row.tags.push({ id: row4.tid, name: row4.name, type: row4.type });
        }
      });
    });

    // 如果是包括产品的话，其产品数据
    if (products.length) {
      _.each(postList, row => {
        _.each(products, row3 => {
          if (row.id === row3.sign_id) {
            if (row3.symbol === 'EOS') {
              row.eosprice = row3.price;
              row.eosdecimals = row3.decimals;
            } else if (row3.symbol === 'ONT') {
              row.ontprice = row3.price;
              row.ontdecimals = row3.decimals;
            }
          }
        });
      });
    }

    return postList;
  }

  // 删除文章
  async delete(id, userid) {
    try {
      const row = {
        status: 1,
      };

      const options = {
        where: {
          id,
          uid: userid, // 只能自己的文章
        },
      };

      // todo，待验证，修改不改变内容，影响行数应该为0
      const result = await this.app.mysql.update('posts', row, options);
      return result.affectedRows === 1;
    } catch (err) {
      this.logger.error('PostService::delete error: %j', err);
    }
    return false;
  }

  async transferOwner(uid, signid, current_uid) {
    const post = await this.app.mysql.get('posts', { id: signid });
    if (!post) {
      return 2;
    }

    if (post.uid !== current_uid) {
      return 3;
    }

    const user = await this.service.account.binding.get2({ id: uid });
    // const user = await this.app.mysql.get('users', { id: uid });
    if (!user) {
      return 4;
    }

    if (!user.accept) {
      return 5;
    }
    // 记录转让文章常用候选列表
    await this.service.history.put('post', uid);

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.update('posts', {
        username: user.username,
        author: user.username,
        uid,
        platform: user.platform,
      }, { where: { id: post.id } });

      await conn.insert('post_transfer_log', {
        postid: signid,
        fromuid: current_uid,
        touid: uid,
        type: 'post',
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      this.ctx.logger.error(err);
      return 6;
    }

    return 0;
  }

  async uploadImage(filename, filelocation) {
    const ctx = this.ctx;

    let result = null;
    try {
      result = await ctx.oss.put(filename, filelocation);
      await fs.unlinkSync(filelocation);
    } catch (err) {
      this.app.logger.error('PostService:: uploadImage error: %j', err);
      return 2;
    }

    if (!result) {
      return 3;
    }

    this.app.logger.info('PostService:: uploadImage success: ' + filename);
    return 0;
  }

  async ipfsUpload(data) {
    let add = null;
    try {
      // 建立连接并上传
      // const ipfs = IpfsHttpClientLite(this.config.ipfs_service.site);
      add = await this.service.ipfs.add(data);
    } catch (err) {
      this.logger.error('PostService:: ipfsUpload Error', err);
      return null;
    }
    return add; // add[0].hash
  }

  async ipfsCatch(hash) {
    let data = null;
    try {
      // 建立连接并获取
      // const ipfs = IpfsHttpClientLite(this.config.ipfs_service.site);
      data = await this.service.ipfs.cat(hash);
    } catch (err) {
      this.logger.error('PostService:: ipfsUpload Error', err);
      return null;
    }
    return data;
  }

  async stats() {
    let userCount = await this.app.redis.hget('user:stat', 'count');
    if (userCount === null) {
      userCount = (await this.app.mysql.query('SELECT COUNT(1) as count FROM users;'))[0].count;
      await this.app.redis.hset('user:stat', 'count', userCount);
    }

    let postCount = await this.app.redis.hget('post:stat', 'count');
    if (postCount === null) {
      postCount = (await this.app.mysql.query('SELECT COUNT(1) as count FROM posts WHERE status = 0;'))[0].count;
      await this.app.redis.hset('post:stat', 'count', postCount);
    }

    let userPoints = await this.app.redis.hget('user:stat', 'point');
    if (userPoints === null) {
      userPoints = (await this.app.mysql.query('SELECT SUM(amount) as amount FROM ,assets;_points;'))[0].amount;
      await this.app.redis.hset('user:stat', 'point', userPoints);
    }

    return {
      users: Number(userCount),
      articles: Number(postCount),
      points: Number(userPoints),
    };
  }

  // 持币阅读
  async addMineTokens(current_uid, id, tokens) {
    const post = await this.get(id);
    if (!post) {
      return -1;
    }

    if (post.uid !== current_uid) {
      return -2;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.query('DELETE FROM post_minetokens WHERE sign_id = ?;', [ id ]);
      let require = 0;
      for (const token of tokens) {
        if (token.amount > 0) {
          require = 1;
          await conn.insert('post_minetokens', {
            sign_id: id,
            token_id: token.tokenId,
            amount: token.amount,
            create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
          });
        }
      }

      await conn.update('posts',
        {
          require_holdtokens: require,
        },
        {
          where: {
            id,
          },
        });

      await conn.commit();

      // if (require) {
      //   await this.app.redis.multi()
      //     .zrem('post:hot:filter:1', id)
      //     .zadd('post:hot:filter:2', post.hot_score, id)
      //     .exec();
      // } else {
      //   await this.app.redis.multi()
      //     .zrem('post:hot:filter:2', id)
      //     .zadd('post:hot:filter:1', post.hot_score, id)
      //     .exec();
      // }

      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -3;
    }
  }

  // 获取阅读文章需要持有的tokens
  async getMineTokens(signId) {
    const tokens = await this.app.mysql.query('SELECT t.id, p.amount, t.name, t.symbol, t.decimals, t.logo FROM post_minetokens p INNER JOIN minetokens t ON p.token_id = t.id WHERE p.sign_id = ?;',
      [ signId ]);
    return tokens;
  }

  // 获取用户持币情况
  // id：文章的Id
  async getHoldMineTokens(signId, userId) {
    const tokens = await this.getMineTokens(signId);
    if (tokens === null || tokens.length === 0) {
      return null;
    }

    const mytokens = [];

    if (tokens && tokens.length > 0) {
      for (const token of tokens) {
        const amount = await this.service.token.mineToken.balanceOf(userId, token.id);
        token.amount = amount;
        mytokens.push(token);
      }
    }
    return mytokens;
  }

  // 判断持币阅读
  async isHoldMineTokens(signId, userId) {
    const tokens = await this.getMineTokens(signId);
    if (tokens === null || tokens.length === 0) {
      return true;
    }

    if (tokens && tokens.length > 0) {
      for (const token of tokens) {
        const amount = await this.service.token.mineToken.balanceOf(userId, token.id);
        if (amount < token.amount) {
          return false;
        }
      }
    }
    return true;
  }

  // todo：拆分出来
  async addPrices(userId, signId, price) {
    const post = await this.get(signId);
    if (!post) {
      return -1;
    }

    if (post.uid !== userId) {
      return -2;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.query('DELETE FROM product_prices WHERE sign_id = ?;', [ signId ]);
      // 默认CNY定价
      await conn.insert('product_prices', {
        sign_id: signId,
        title: post.title,
        sku: signId,
        stock_quantity: 0,
        platform: 'cny',
        symbol: 'CNY',
        price,
        decimals: 4,
        status: 1,
      });

      await conn.update('posts',
        {
          require_buy: 1,
        },
        {
          where: {
            id: signId,
          },
        });

      await conn.commit();

      /* await this.app.redis.multi()
        .zrem('post:hot:filter:1', id)
        .zadd('post:hot:filter:4', post.hot_score, id)
        .exec(); */

      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -3;
    }
  }

  async delPrices(userId, signId) {
    const post = await this.get(signId);
    if (!post) {
      return -1;
    }

    if (post.uid !== userId) {
      return -2;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.query('DELETE FROM product_prices WHERE sign_id = ?;', [ signId ]);

      await conn.update('posts',
        {
          require_buy: 0,
        },
        {
          where: {
            id: signId,
          },
        });

      await conn.commit();

      // await this.app.redis.multi()
      //   .zrem('post:hot:filter:4', id)
      //   .zadd('post:hot:filter:1', post.hot_score, id)
      //   .exec();

      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -3;
    }
  }

  async addBookmark(userId, postId) {
    const { existence } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM posts WHERE id = ?) existence;', [ postId ]))[0];
    if (!existence) {
      return null;
    }

    const { affectedRows } = await this.app.mysql.query('INSERT IGNORE post_bookmarks VALUES(?, ?, ?);', [ userId, postId, moment().format('YYYY-MM-DD HH:mm:ss') ]);

    return affectedRows === 1;
  }

  async removeBookmark(userId, postId) {
    const { existence } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM posts WHERE id = ?) existence;', [ postId ]))[0];
    if (!existence) {
      return null;
    }

    const { affectedRows } = await this.app.mysql.delete('post_bookmarks', {
      uid: userId,
      pid: postId,
    });

    return affectedRows === 1;
  }

  async uploadArticleToIpfs({
    title, description, displayName, data, isEncrypt = false }) {
    let markdown = data.content;
    let metadata = JSON.stringify(data);
    description = await this.wash(description);
    // 如果需要加密，则替换渲染HTML文章内容
    if (isEncrypt) {
      markdown = `${description}
很抱歉这是一篇付费/持币阅读文章，内容已被加密。
若需要阅读更多内容，请返回到 Matataki 查看原文`;
      metadata = JSON.stringify(this.service.cryptography.encrypt(metadata));
    }

    // 渲染html并上传
    const renderedHtml = articleToHtml({
      title,
      author: {
        nickname: displayName,
        uid: this.ctx.user.id,
        username: displayName,
      },
      description,
      datePublished: new Date(),
      markdown,
    });
    // 上传的data是json对象， 需要字符串化
    const [ metadataHash, htmlHash ] = await Promise.all([
      this.ipfsUpload(metadata),
      this.service.ipfs.uploadToAws(renderedHtml),
    ]);
    return { metadataHash, htmlHash };
  }

}

module.exports = PostService;
