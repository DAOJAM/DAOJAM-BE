'use strict';
const axios = require('axios');
const moment = require('moment');
const Service = require('egg').Service;
const path=require('path');
const htmlparser = require('node-html-parser');

const domains = [ 'https://wwwtest.smartsignature.io/p/', 'https://wwwtest.smartsignature.io/p/', 'https://test.frontenduse.top/p/',
  'https://matataki.io/p/', 'https://www.matataki.io/p/', 'https://smartsignature.frontenduse.top/p/' ];

const matatakiUrlReg = /http(?:s)?:\/\/(?:\w+.)?(?:smartsignature.io|matataki.(?:io|cn)|frontenduse.top)\/(?:p|share)\/(\d+)/;

class ReferencesService extends Service {
  // 是否是内部的文章
  checkInnerPost(url) {
    return matatakiUrlReg.test(url.toLowerCase());
    /* for (const domain of domains) {
      if (url.toLowerCase().startsWith(domain)) {
        return true;
      }
    }
    return false; */
  }

  extractSignId(url) {
    return parseInt(url.match(matatakiUrlReg)[1]);
    // return parseInt(url.match(/\/p\/(\d+)/)[1]);
  }

  async extractRefTitle(url) {
    let ref_sign_id = 0;
    if (this.checkInnerPost(url)) {
      ref_sign_id = this.extractSignId(url);
    }

    if (ref_sign_id > 0) {
      const post = await this.service.post.getById2(ref_sign_id);
      if (post === null) return null;
      const { username, email, nickname, platform, avatar } = post;
      return {
        ref_sign_id,
        title: post.title,
        summary: post.short_content,
        cover: post.cover,
        channel_id: post.channel_id,
        user: {
          username, email, nickname, platform, avatar,
        },
      };
    }

    const title = '', summary = '';
    try {
      const rawPage = await axios.get(url, {
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
      // 微信公众号就是屑，网页版在客户端渲染title，直接抓取 html 时的 <title> 为空
      // 但是多谢微信意识到 OpenGraph 规范的存在，我们可以试着读取 - Frank
      let { title, description: summary, image: coverUrl } = await this.service.metadata.GetFromRawPage(rawPage, url);
      let cover = '';
      if (coverUrl) {
        const imgFileName = './uploads/today_' + Date.now() + '.' + path.extname(coverUrl);
        cover = await this.service.postImport.uploadArticleImage(coverUrl, imgFileName);
      }

      if (!title) {
        const matchOgTitle = rawPage.data.match(/<meta.*?property="og:title". *?content=["|']*(.*?)["|'|\/]*>/);
        const matchTitleTag = rawPage.data.match(/<title.*?>([\S\s]*?)<\/title>/); // /<title.*?>([\S\s]*?)<\/title>/，/(?<=<title[\S\s]*?>)[\S\s]*?(?=<\/title>)/

        if (matchOgTitle && matchOgTitle.length > 1 && matchOgTitle[1].length > 1) {
          title = matchOgTitle[1];
        } else if (matchTitleTag && matchTitleTag.length > 1) {
          // 不支持 OpenGraph 只能从 title 碰运气了
          title = matchTitleTag[1];
        }
      }

      return {
        ref_sign_id,
        title,
        summary,
        cover,
      };
    } catch (err) {
      this.logger.error('References::extractRefTitle: error:', err);
      return {
        ref_sign_id,
        title,
        summary,
      };
    }
  }


  // sign_id,url 数据库里增加了唯一索引
  async addDraftReference(uid, draftId, url, title, summary) {
    if (!await this.hasDraftReferencePermission(uid, draftId)) {
      return -1;
    }

    let ref_sign_id = 0;
    if (this.checkInnerPost(url)) {
      ref_sign_id = this.extractSignId(url);
    }

    try {
      const sql = ` INSERT INTO post_references (draft_id, ref_sign_id, url, title, summary, number, create_time, status) 
      SELECT :draft_id, :ref_sign_id, :url, :title, :summary, (SELECT IFNULL(MAX(number), 0) + 1 FROM post_references WHERE draft_id=:draft_id), :time, 0
      ON DUPLICATE KEY UPDATE title = :title, summary = :summary, create_time = :time, status = 0; `;
      await this.app.mysql.query(sql, {
        draft_id: draftId, ref_sign_id, url, title, summary, time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }
  async addReference(uid, signId, url, title, summary) {
    if (!await this.hasReferencePermission(uid, signId)) {
      return -1;
    }

    let ref_sign_id = 0;
    if (this.checkInnerPost(url)) {
      ref_sign_id = this.extractSignId(url);
    }

    try {
      const sql = ` INSERT INTO post_references (sign_id, ref_sign_id, url, title, summary, number, create_time, status) 
                  SELECT :sign_id, :ref_sign_id, :url, :title, :summary, (SELECT IFNULL(MAX(number), 0) + 1 FROM post_references WHERE sign_id=:sign_id), :time, 0
                  ON DUPLICATE KEY UPDATE title = :title, summary = :summary, create_time = :time, status = 0; `;
      await this.app.mysql.query(sql, {
        sign_id: signId, ref_sign_id, url, title, summary, time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }

  async publish(uid, draftId, signId) {
    if (!await this.hasDraftReferencePermission(uid, draftId)) {
      return -1;
    }

    if (!await this.hasReferencePermission(uid, signId)) {
      return -1;
    }

    try {
      await this.app.mysql.query('UPDATE post_references SET draft_id=0, sign_id=:sign_id WHERE draft_id=:draft_id;',
        { draft_id: draftId, sign_id: signId });
      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }

  async deleteDraftReferenceNode(uid, draftId, number) {
    if (!await this.hasDraftReferencePermission(uid, draftId)) {
      return -1;
    }

    try {
      await this.app.mysql.update('post_references',
        { status: 1 },
        {
          where: { draft_id: draftId, number },
        });
      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }
  async deleteReferenceNode(uid, signId, number) {
    if (!await this.hasReferencePermission(uid, signId)) {
      return -1;
    }

    try {
      await this.app.mysql.update('post_references',
        { status: 1 },
        {
          where: { sign_id: signId, number },
        });
      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }

  async getDraftReference(uid, draftId, number) {
    const references = await this.app.mysql.select('post_references', {
      columns: [ 'id', 'url', 'title', 'summary', 'number' ],
      where: { draft_id: draftId, number },
    });
    if (references.length > 0) {
      return references[0];
    }

    return null;
  }
  async getReference(uid, signId, number) {
    const references = await this.app.mysql.select('post_references', {
      columns: [ 'id', 'url', 'title', 'summary', 'number' ],
      where: { sign_id: signId, number },
    });
    if (references.length > 0) {
      return references[0];
    }

    return null;
  }

  // 判断是否有权限修改
  async hasDraftReferencePermission(current_uid, draftId) {
    const draft = await this.app.mysql.get('drafts', { id: draftId });
    if (!draft) {
      return false;
    }
    if (draft.uid !== current_uid) {
      return false;
    }
    return true;
  }
  async hasReferencePermission(current_uid, signId) {
    const post = await this.service.post.get(signId);
    if (!post) {
      return false;
    }
    if (post.uid !== current_uid) {
      return false;
    }
    return true;
  }

  // 获取引用的文章列表
  async getDraftReferences(draftId, page = 1, pagesize = 20) {
    const references = await this.app.mysql.query(`
    SELECT url, title, summary, number 
    FROM post_references
    WHERE draft_id = :draftId and status = 0
    LIMIT :start, :end;
    SELECT COUNT(*) AS count FROM post_references WHERE draft_id = :draftId and status = 0;`,
    { draftId, start: (page - 1) * pagesize, end: 1 * pagesize });
    return {
      count: references[1][0].count,
      list: references[0],
    };
  }
  async getReferences(signId, page = 1, pagesize = 20) {
    const sql = `
      SELECT t1.sign_id, t1.ref_sign_id, t1.url, t1.title, t1.summary, t1.cover, t1.create_time, t1.number,
      t2.channel_id,
      t3.username, t3.nickname, t3.platform, t3.avatar, t3.id uid,
      t4.real_read_count, t4.likes, t4.dislikes,
      t5.platform as pay_platform, t5.symbol as pay_symbol, t5.price as pay_price, t5.decimals as pay_decimals, t5.stock_quantity as pay_stock_quantity,
      t7.id as token_id, t6.amount as token_amount, t7.name as token_name, t7.symbol as token_symbol, t7.decimals as token_decimals
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
      WHERE t1.sign_id = :signId and t1.status = 0
      LIMIT :start, :end;
      SELECT COUNT(*) AS count FROM post_references WHERE sign_id = :signId and status = 0;`;
    const references = await this.app.mysql.query(sql,
      { signId, start: (page - 1) * pagesize, end: 1 * pagesize });
    return {
      count: references[1][0].count,
      list: references[0],
    };
  }

  // 查看本文被引用列表
  async getPosts(signId, page = 1, pagesize = 20) {
    const references = await this.app.mysql.query(`
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
      WHERE t1.ref_sign_id = :id AND t1.status = 0
      LIMIT :start, :end;
      SELECT COUNT(*) AS count FROM post_references WHERE ref_sign_id = :id AND sign_id > 0 AND status = 0;`,
    { id: signId, start: (page - 1) * pagesize, end: 1 * pagesize });
    return {
      count: references[1][0].count,
      list: references[0],
    };
  }
}

module.exports = ReferencesService;
