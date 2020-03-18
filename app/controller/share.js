'use strict';

const Controller = require('../core/base_controller');

const moment = require('moment');

class ShareController extends Controller {
  // 发布分享
  async create() {
    const ctx = this.ctx;
    if (await ctx.Limit({ max: 10, time: '1m' })) {
      ctx.status = 429;
      ctx.body = ctx.msg.publishRatelimit;
      return;
    }
    // ref_sign_id title summary cover url
    const { author, content, platform, refs } = ctx.request.body;
    this.logger.info('controller.share params', { author, content, platform, refs });
    if (!Array.isArray(refs)) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const timestamp = moment(now).valueOf() / 1000;

    // 上传ipfs
    const hash = await this.service.post.ipfsUpload(JSON.stringify({
      timestamp,
      author,
      content,
      refs,
    }));
    this.logger.info('controller.share hash', hash);
    if (!hash) {
      ctx.body = ctx.msg.ipfsUploadFailed;
      return;
    }

    const id = await ctx.service.share.create({
      author,
      username: ctx.user.username,
      short_content: content,
      hash,
      is_original: 1,
      create_time: now,
      platform,
      uid: ctx.user.id,
      is_recommend: 0,
      category_id: 0,
    }, refs);

    this.logger.info('controller.share id', id);

    // 添加分享到elastic search
    await this.service.search.importShare({ id, content });

    if (id > 0) {
      ctx.body = ctx.msg.success;
      ctx.body.data = id;
    } else {
      ctx.body = ctx.msg.postPublishError; // todo 可以再细化失败的原因
    }
  }
  // 分享列表
  async index() {
    const { ctx } = this;
    let { author = null, page = 1, pagesize = 20, type = 'time' } = ctx.query;
    let postData = null;
    if (author) type = 'time';
    if (type === 'time') {
      postData = await this.service.share.timeRank(page, pagesize, author);
    } else if (type === 'hot') {
      postData = await this.service.share.hotRank(page, pagesize, author);
    }

    if (postData === 2 || postData === null) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    if (postData) {
      ctx.body = ctx.msg.success;
      ctx.body.data = postData;
      return;
    }
  }
  // 详情
  async show() {
    const { ctx } = this;
    const id = ctx.params.id;
    const result = await this.service.share.get(id);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async getHotArticle() {
    const { ctx } = this;
    const { id } = ctx.query;
    /* const result1 = await this.app.redis.zrevrange('post:score:filter:1', 0, 19);
    const result2 = await this.app.redis.zrevrange('post:score:filter:3', 0, 9); */
    const rank = await this.app.redis.zrank('post:score:filter:1', id);
    const count = await this.app.redis.zcard('post:score:filter:1');
    const postList = await this.app.redis.zrange('post:score:filter:1', 0, -1, 'WITHSCORES');
    const shareList = await this.app.redis.zrange('post:score:filter:3', 0, -1, 'WITHSCORES');
    const postListLen = postList.length;
    const shareListLen = shareList.length;
    const result = [];
    for (let i = 0; i < postListLen; i += 2) {
      result.push({
        id: postList[i],
        hot_score: postList[i + 1],
      });
    }
    for (let i = 0; i < shareListLen; i += 2) {
      result.push({
        id: shareList[i],
        hot_score: shareList[i + 1],
      });
    }
    ctx.body = {
      ...ctx.msg.success,
      rank: count - rank,
      data1: result,
    };
  }
}

module.exports = ShareController;
