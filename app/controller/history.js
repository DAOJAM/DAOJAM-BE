'use strict';

const Controller = require('../core/base_controller');

class HistoryController extends Controller {
  async update() {
    const { ctx } = this;
    const { uid } = ctx.query;
    const result = await ctx.service.history.put('post', uid);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async index() {
    const { ctx } = this;
    const { type } = ctx.query;
    const key = ctx.service.history.getKey(type);
    if (!key) {
      ctx.body = {
        ...ctx.msg.paramsError,
      };
      return;
    }
    const userids = await ctx.service.history.get(key);
    ctx.logger.info('userids', userids);
    let userList = await this.service.user.getUserList(userids);
    userList = userList.sort((a, b) => {
      return userids.indexOf(a.id.toString()) - userids.indexOf(b.id.toString());
    });
    ctx.body = {
      ...ctx.msg.success,
      data: userList,
    };
  }
}

module.exports = HistoryController;
