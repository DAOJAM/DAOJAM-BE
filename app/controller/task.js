'use strict';

const Controller = require('../core/base_controller');

class TaskController extends Controller {
  async task() {
    const result = await this.service.task.task();
    this.ctx.body = {
      ...this.ctx.msg.success,
      data: result
    };
  }
}

module.exports = TaskController;
