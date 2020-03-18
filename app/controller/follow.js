'use strict';

const Controller = require('../core/base_controller');
const moment = require('moment');
const _ = require('lodash');

class FollowController extends Controller {

  // 关注动作
  async follow() {
    const ctx = this.ctx;

    const { uid } = ctx.request.body;

    const resp = await this.service.follow.follow(uid);

    if (resp === 1) {
      ctx.body = ctx.msg.failure;
      return;
    }

    if (resp === 2) {
      ctx.body = ctx.msg.followYourself;
      return;
    }

    if (resp === 3) {
      ctx.body = ctx.msg.userNotExist;
      return;
    }

    ctx.body = ctx.msg.success;
  }

  // 取消关注动作
  async unfollow() {
    const ctx = this.ctx;

    const { uid } = ctx.request.body;

    const resp = await this.service.follow.unfollow(uid);

    if (resp === 1) {
      ctx.body = ctx.msg.failure;
      return;
    }

    // 失败， 不能关注自己
    if (resp === 2) {
      ctx.body = ctx.msg.followYourself;
      return;
    }

    // 失败， 用户不存在
    if (resp === 3) {
      ctx.body = ctx.msg.userNotExist;
      return;
    }

    ctx.body = ctx.msg.success;
  }

  // 关注列表
  async follows() {
    const ctx = this.ctx;

    const { pagesize = 20, page = 1, uid = null } = ctx.query;

    const resp = await this.service.follow.follows(pagesize, page, uid);

    if (resp === 2) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = resp;
  }

  // 粉丝列表
  async fans() {
    const ctx = this.ctx;

    const { pagesize = 20, page = 1, uid = null } = ctx.query;

    const resp = await this.service.follow.fans(pagesize, page, uid);

    if (resp === 2) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = resp;
  }

}

module.exports = FollowController;
