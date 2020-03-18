'use strict';
const Service = require('egg').Service;
const moment = require('moment');
const SHARE_CHANNEL_ID = 3;

class ShareService extends Service {

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

  async addReference({ uid, signId, url, title, summary, cover }, conn) {
    /* if (!await this.service.references.hasReferencePermission(uid, signId)) {
      return -1;
    } */

    let ref_sign_id = 0;
    this.logger.info('service.share addReference url', url);
    if (this.service.references.checkInnerPost(url)) {
      ref_sign_id = this.service.references.extractSignId(url);
      this.logger.info('service.share addReference ref_sign_id', ref_sign_id);
    }

    try {
      const sql = ` INSERT INTO post_references (sign_id, ref_sign_id, url, title, summary, number, create_time, status, cover) 
                  SELECT :sign_id, :ref_sign_id, :url, :title, :summary, (SELECT IFNULL(MAX(number), 0) + 1 FROM post_references WHERE sign_id=:sign_id), :time, 0, :cover
                  ON DUPLICATE KEY UPDATE title = :title, summary = :summary, create_time = :time, status = 0, cover = :cover; `;
      await conn.query(sql, {
        sign_id: signId, ref_sign_id, url, title, summary, time: moment().format('YYYY-MM-DD HH:mm:ss'), cover,
      });

      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }
  async create(data, refs) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      const result = await conn.insert('posts', {
        ...data,
        channel_id: SHARE_CHANNEL_ID,
      });
      this.logger.info('service.share insert posts result', result);
      if (result.affectedRows === 1) {
        // 创建统计表栏目
        await conn.query(
          'INSERT INTO post_read_count(post_id, real_read_count, sale_count, support_count, eos_value_count, ont_value_count)'
          + ' VALUES(?, 0, 0, 0 ,0, 0);',
          [ result.insertId ]
        );
        this.logger.info('service.share create insert post_read_count');
      }
      const signId = result.insertId;
      const uid = this.ctx.user.id;
      for (const ref of refs) {
        const { url, title, summary, cover } = ref;
        this.logger.info('service.share create addReference params', ref);
        const result = await this.addReference({
          uid, signId, url, title, summary, cover,
        }, conn);
        this.logger.info('service.share create addReference result', result);
        if (result < 0) {
          conn.rollback();
          return -1;
        }
      }
      conn.commit();
      return signId;
    } catch (err) {
      await conn.rollback();
      this.logger.error('ShareService::create error: %j', err);
      return -1;
    }
  }
  async get(id) {
    const posts = await this.app.mysql.select('posts', {
      where: { id, channel_id: SHARE_CHANNEL_ID },
      columns: [ 'id', 'hash', 'uid', 'title', 'short_content', 'status', 'create_time', 'comment_pay_point', 'channel_id', 'require_buy' ], // todo：需要再增加
    });
    if (posts && posts.length > 0) {
      return posts[0];
    }
    return null;
  }
  async timeRank(page = 1, pagesize = 20, author = null) {
    let wheresql = 'WHERE a.\`status\` = 0 AND a.channel_id = 3 ';
    if (author) wheresql += ' AND a.uid = :author ';
    const sql = `SELECT a.id, a.uid, a.author, a.title, a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, a.short_content,
      b.nickname, b.avatar, 
      c.real_read_count AS \`read\`, c.likes 
      FROM posts a
      LEFT JOIN users b ON a.uid = b.id 
      LEFT JOIN post_read_count c ON a.id = c.post_id 
      ${wheresql} 
      ORDER BY a.time_down ASC, a.id DESC LIMIT :start, :end;
      SELECT COUNT(*) AS count FROM posts a
      ${wheresql};`;
    const queryResult = await this.app.mysql.query(
      sql,
      { start: (page - 1) * pagesize, end: 1 * pagesize, author }
    );
    const posts = queryResult[0];
    const count = queryResult[1][0].count;
    const postids = [];
    const len = posts.length;
    const id2posts = {};
    for (let i = 0; i < len; i++) {
      const row = posts[i];
      posts[i].refs = [];
      posts[i].beRefs = [];
      id2posts[row.id] = row;
      postids.push(row.id);
    }
    if (len === 0) {
      return {
        count,
        list: posts,
      };
    }
    const refResult = await this.getRef(postids);
    const refs = refResult[0],
      beRefs = refResult[1],
      refsLen = refs.length,
      beRefsLen = beRefs.length;
    // 引用
    for (let i = 0; i < refsLen; i++) {
      const id = refs[i].sign_id;
      id2posts[id].refs.push(refs[i]);
    }
    // 被引用
    for (let i = 0; i < beRefsLen; i++) {
      const id = beRefs[i].ref_sign_id;
      id2posts[id].beRefs.push(beRefs[i]);
    }
    return {
      count,
      list: posts,
    };
  }
  async hotRank(page = 1, pagesize = 20) {
    const postids = await this.service.hot.list(page, pagesize, SHARE_CHANNEL_ID);
    if (postids === null || postids.length <= 0) {
      return {
        count: 0,
        list: [],
      };
    }
    const sql = `SELECT a.id, a.uid, a.author, a.title, a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, a.short_content,
      b.nickname, b.avatar, 
      c.real_read_count AS \`read\`, c.likes 
      FROM posts a
      LEFT JOIN users b ON a.uid = b.id 
      LEFT JOIN post_read_count c ON a.id = c.post_id 
      WHERE a.id IN (:postids)
      ORDER BY FIELD(a.id, :postids);
      
      SELECT COUNT(*) AS count FROM posts a
      WHERE a.\`status\` = 0 AND a.channel_id = 3;`;
    const queryResult = await this.app.mysql.query(
      sql,
      { start: (page - 1) * pagesize, end: 1 * pagesize, postids }
    );
    const posts = queryResult[0];
    const count = queryResult[1][0].count;
    const len = posts.length;
    const id2posts = {};
    for (let i = 0; i < len; i++) {
      const row = posts[i];
      posts[i].refs = [];
      posts[i].beRefs = [];
      id2posts[row.id] = row;
    }
    if (len === 0) {
      return {
        count,
        list: posts,
      };
    }
    const refResult = await this.getRef(postids);
    const refs = refResult[0],
      beRefs = refResult[1],
      refsLen = refs.length,
      beRefsLen = beRefs.length;
    // 引用
    for (let i = 0; i < refsLen; i++) {
      const id = refs[i].sign_id;
      id2posts[id].refs.push(refs[i]);
    }
    // 被引用
    for (let i = 0; i < beRefsLen; i++) {
      const id = beRefs[i].ref_sign_id;
      id2posts[id].beRefs.push(beRefs[i]);
    }
    return {
      count,
      list: posts,
    };
  }
  async getRef(postids) {
    const refResult = await this.app.mysql.query(
      `SELECT t1.sign_id, t1.ref_sign_id, t1.url, t1.title, t1.summary, t1.cover, t1.create_time, t1.number,
      t2.channel_id,
      t3.username, t3.nickname, t3.platform, t3.avatar, t3.id uid,
      t4.real_read_count, t4.likes, t4.dislikes,
      t5.platform as pay_platform, t5.symbol as pay_symbol, t5.price as pay_price, t5.decimals as pay_decimals, t5.stock_quantity as pay_stock_quantity,
      t7.id as token_id, t6.amount as token_amount, t7.name as token_name, t7.symbol as token_symbol, t7.decimals  as token_decimals
      FROM post_references t1
      LEFT JOIN posts t2
      ON t1.ref_sign_id = t2.id
      LEFT JOIN users t3
      ON t2.uid = t3.id
      LEFT JOIN post_read_count t4
      ON t1.ref_sign_id = t4.post_id
      LEFT JOIN product_prices t5
      ON t1.ref_sign_id = t5.sign_id
      LEFT JOIN post_minetokens t6
      ON t1.ref_sign_id = t6.sign_id
      LEFT JOIN minetokens t7
      ON t7.id = t6.token_id 
      WHERE t1.sign_id IN ( :postids ) AND t1.status = 0;

      SELECT t1.sign_id, t1.ref_sign_id, t1.create_time, t1.number,
      t2.channel_id, t2.title, t2.short_content AS summary, t2.cover, 
      t3.username, t3.nickname, t3.platform, t3.avatar, t3.id uid,
      t4.real_read_count, t4.likes, t4.dislikes,
      t5.platform as pay_platform, t5.symbol as pay_symbol, t5.price as pay_price, t5.decimals as pay_decimals, t5.stock_quantity as pay_stock_quantity,
      t7.id as token_id, t6.amount as token_amount, t7.name as token_name, t7.symbol as token_symbol, t7.decimals  as token_decimals
      FROM post_references t1
      LEFT JOIN posts t2
      ON t1.sign_id = t2.id
      LEFT JOIN users t3
      ON t2.uid = t3.id
      LEFT JOIN post_read_count t4
      ON t1.sign_id = t4.post_id
      LEFT JOIN product_prices t5
      ON t1.sign_id = t5.sign_id
      LEFT JOIN post_minetokens t6
      ON t1.sign_id = t6.sign_id
      LEFT JOIN minetokens t7
      ON t7.id = t6.token_id 
      WHERE t1.ref_sign_id IN ( :postids ) AND t1.status = 0;`,
      { postids }
    );
    return refResult;
  }
}

module.exports = ShareService;
