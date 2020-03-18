'use strict';

const Controller = require('egg').Controller;

class JobController extends Controller {
  async index() {
    const { ctx } = this;
    const { uid } = ctx.query;
    const result = await this.service.dao.job.list(uid);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async create() {
    const { ctx } = this;
    const uid = ctx.user.id;
    const { creates } = ctx.request.body;
    /* --------------检验参数start-------------- */
    let flag = 0;
    if (!Array.isArray(creates)) flag = 1;
    for (const item of creates) {
      item.uid = uid;
      const { jid, value } = item;
      if (jid === undefined) flag = 1;
      if (value === undefined) flag = 1;
      // 校验数据是否存在
      const checkExist = await this.service.dao.job.get(jid);
      if (!checkExist) flag = 1;
    }
    if (flag === 1) {
      ctx.body = ctx.msg.paramsError;
      return;
    }
    /* --------------检验参数end-------------- */
    const result = await this.service.dao.job.create(creates);
    if (!result.status) {
      ctx.body = {
        ...ctx.msg.failure,
        data: result.msg,
      };
      return;
    }
    ctx.body = {
      ...ctx.msg.success,
      data: result.msg,
    };
  }
  async update() {
    const { ctx } = this;
    const uid = ctx.user.id;
    const { jid, value } = ctx.request.body;
    const result = await this.service.dao.job.update(uid, jid, value);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async destroy() {
    const { ctx } = this;
    const uid = ctx.user.id;
    const { jid } = ctx.request.body;
    const result = await this.service.dao.job.delete(uid, jid);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async options() {
    const { ctx } = this;
    const result = await this.service.dao.job.getAll();
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
}

module.exports = JobController;
