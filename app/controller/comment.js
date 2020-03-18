'use strict';

const Controller = require('../core/base_controller');

class CommentController extends Controller {
  async comments() {
    const ctx = this.ctx;
    const { pagesize = 20, page = 1, signid } = this.ctx.query;

    // singid缺少,此种情况用户正常使用时候不会出现
    if (!signid) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    const comments = await this.service.comment.commentList(parseInt(signid), parseInt(page), parseInt(pagesize));

    if (comments === null) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = comments;
  }

  // 直接评论，需要支付积分
  async comment() {
    const ctx = this.ctx;
    const { signId, comment } = this.ctx.request.body;

    const result = await this.service.comment.payPointCreate(ctx.user.id, ctx.user.username, signId, comment, this.clientIP);
    if (result === -1) {
      ctx.body = ctx.msg.pointNotEnough;
      return;
    } else if (result < 0) {
      ctx.body = ctx.msg.failure;
      return;
    }
    ctx.body = ctx.msg.success;
  }
}

module.exports = CommentController;
