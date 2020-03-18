'use strict';

const Controller = require('egg').Controller;

class LikeController extends Controller {

  // 文章在客户端打开后提交，表示开始阅读
  // 前端刷新会重新计时
  async reading() {
    const ctx = this.ctx;
    await ctx.service.mining.reading(ctx.user.id, ctx.params.id);
    ctx.body = ctx.msg.success;
  }

  // 喜欢
  async like() {
    const ctx = this.ctx;
    const { time } = ctx.request.body;
    const result = await this.service.mining.like(ctx.user.id, ctx.params.id, time, ctx.ip);
    if (result === 0) {
      const points = await this.service.mining.getPointslogBySignId(ctx.user.id, ctx.params.id);
      ctx.body = ctx.msg.success;
      ctx.body.data = points;
    } else {
      ctx.body = ctx.msg.pointReadError;
      ctx.body.data = result;
    }
  }

  // 不喜欢
  async dislike() {
    const ctx = this.ctx;
    const { time } = ctx.request.body;
    const result = await this.service.mining.dislike(ctx.user.id, ctx.params.id, time, ctx.ip);
    if (result === 0) {
      const points = await this.service.mining.getPointslogBySignId(ctx.user.id, ctx.params.id);
      ctx.body = ctx.msg.success;
      ctx.body.data = points;
    } else {
      ctx.body = ctx.msg.pointReadError;
      ctx.body.data = result;
    }
  }

  // 阅读新内容30秒，增加阅读新内容积分
  async readnew() {
    const ctx = this.ctx;
    const { time } = ctx.request.body;
    const points = await this.service.mining.readNew(ctx.user.id, ctx.params.id, time, ctx.ip);
    if (points > 0) {
      ctx.body = ctx.msg.success;
      ctx.body.data = points;
    } else {
      ctx.body = ctx.msg.pointReadError;
      ctx.body.data = points;
    }
  }

}

module.exports = LikeController;
