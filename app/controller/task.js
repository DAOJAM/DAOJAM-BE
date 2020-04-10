'use strict';

const Controller = require('../core/base_controller');

class TaskController extends Controller {
  async task() {
    const result = await this.service.task.task();
    this.ctx.body = {
      ...this.ctx.msg.success,
      data: result,
    };
  }

  async taskTeam() {
    const { ctx } = this;
    const tokenId = parseInt(ctx.params.id);
    if (tokenId) {
      const result = await this.service.task.taskTeam(tokenId);
      ctx.body = {
        ...this.ctx.msg.success,
        data: result,
      };
    } else {
      ctx.body = ctx.msg.failure;
    }
  }

  async updateTask() {
    const ctx = this.ctx;
    const { task } = this.ctx.request.body;
    const userId = ctx.user.id;
    if (userId) {
      const result = await ctx.service.task.updateTask(userId, task);
      if (result.code === 0) {
        ctx.body = {
          ...ctx.msg.success,
          data: result.data,
        };
      } else {
        ctx.body = ctx.msg.failure;
      }
      if (result.message) {
        ctx.body.message = result.message;
      }
    } else {
      ctx.body = ctx.msg.failure;
    }
  }
}

module.exports = TaskController;
