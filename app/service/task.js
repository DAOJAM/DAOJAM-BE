'use strict';
const Service = require('egg').Service;
class TaskService extends Service {
  // 任务列表
  async task() {
    try {
      return await this.app.mysql.select('tasks');
    } catch (e) {
      console.log(e)
      this.ctx.logger.error(`task fail: ${e}`);
      return []
    }
  }
}

module.exports = TaskService;
