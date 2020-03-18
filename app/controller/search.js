'use strict';

const Controller = require('egg').Controller;

class SearchController extends Controller {
  // 普通搜索， 搜索文章
  async search() {
    const ctx = this.ctx;
    const { type = 'post', word = 'smart', channel = null, page = 1, pagesize = 10 } = ctx.query;

    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    if (word.length > 50) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    // 还需要记录搜索历史
    await this.service.search.writeLog(word, 1);

    let result;
    if (type === 'post') {
      // 带了文章id， 视为精确搜索
      if (word[0] === '#') {
        const postid = parseInt(word.substring(1, word.length));
        if (isNaN(postid)) {
          ctx.body = ctx.msg.paramsError;
          return;
        }
        const post = await this.service.search.precisePost(postid);
        // 精确搜索， 需要独立把文章摘要提取出来
        result = post;
      } else {
        // 带channel搜索
        if (channel) {
          const channelId = parseInt(channel);
          if (!(channelId === 1 || channelId === 2)) {
            ctx.body = ctx.msg.paramsError;
            return;
          }
          result = await this.service.search.searchPost(word, channelId, page, pagesize);
        // 不带category搜索
        } else {
          result = await this.service.search.searchPost(word, null, page, pagesize);
        }
      }
    }

    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }
  async searchPost() {
    const ctx = this.ctx;
    const { word = 'smart', page = 1, pagesize = 10 } = ctx.query;
    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    if (word.length > 50) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    // 还需要记录搜索历史
    await this.service.search.writeLog(word, 1);

    let result;
    // 带了文章id， 视为精确搜索
    if (word[0] === '#') {
      const postid = parseInt(word.substring(1, word.length));
      if (isNaN(postid)) {
        ctx.body = ctx.msg.paramsError;
        return;
      }
      const post = await this.service.search.precisePost(postid);
      // 精确搜索， 需要独立把文章摘要提取出来
      result = post;
    } else {
      result = await this.service.search.searchPost(word, 1, page, pagesize);
    }
    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }

  // 搜索用户
  async searchUser() {
    const ctx = this.ctx;
    const current_user = ctx.user.id;
    const { word = 'smart', page = 1, pagesize = 10 } = ctx.query;

    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    if (word.length > 50) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    // 还需要记录搜索历史
    await this.service.search.writeLog(word, 3);

    const result = await this.service.search.searchUser(word, page, pagesize, current_user);

    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }
  async searchShare() {
    const ctx = this.ctx;
    const { word = 'smart', page = 1, pagesize = 10 } = ctx.query;
    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    if (word.length > 50) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    // 记录搜索结果，type：4代表分享
    await this.service.search.writeLog(word, 4);
    const result = await this.service.search.searchShare(word, page, pagesize);

    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;

  }

  async searchToken() {
    const ctx = this.ctx;
    const { word = 'smart', page = 1, pagesize = 10 } = ctx.query;
    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    if (word.length > 50) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    // 记录搜索结果，type：5代表token
    await this.service.search.writeLog(word, 5);
    const result = await this.service.search.searchToken(word, page, pagesize);

    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;

  }

  async recommand() {
    const ctx = this.ctx;
    const { amount = 5, area = 1 } = ctx.query;

    const amountNum = parseInt(amount);
    const areaNum = parseInt(area);
    if (isNaN(amountNum) || isNaN(areaNum)) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    const result = await this.service.search.recommandWord(amountNum, areaNum);
    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }
}

module.exports = SearchController;
