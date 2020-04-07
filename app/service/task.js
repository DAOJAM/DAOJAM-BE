'use strict';
const Service = require('egg').Service;
const moment = require('moment');

class TaskService extends Service {
  /**
   * 获取token信息
   * @param {object} parameters 查找的参数
   */
  async getToken(parameters) {
    const token = await this.app.mysql.get('minetokens', parameters);
    return token;
  }

  // 获取token
  getByUserId(uid) {
    return this.getToken({ uid });
  }

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

  // 任务列表
  async taskTeam(userId) {
    const token = await this.getByUserId(userId);
    if (!token) {
      return []
    }

    try {
      return await this.app.mysql.select('minetoken_tasks', {
        where: {
          "token_id": token.id
        }
      });
    } catch (e) {
      console.log(e)
      this.ctx.logger.error(`task fail: ${e}`);
      return []
    }
  }

  /**
   *
   * @param userId
   * @param task { object }
   * @returns {Promise<{code: number, message: *}|{code: number}>}
   */
  async updateTask(userId, task) {
    const token = await this.getByUserId(userId);
    if (token.id !== task.team_id) {
      return {
        code: -1,
      }
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 删除该团队的所有主线任务
      await conn.delete('minetoken_tasks', {
        token_id: task.team_id,
        type: 0
      });
      // 更新该团队所有的主线任务
      await conn.insert('minetoken_tasks', {
        token_id: task.team_id,
        task_id: task.data.mainTask[0], // 单选
        type: 0, // 主线任务
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });
      // 删除该团队的所有支线任务
      await conn.delete('minetoken_tasks', {
        token_id: task.team_id,
        type: 1
      });
      // 更新该团队所有的支线任务
      let sideTaskList = task.data.sideTask
      for (let i = 0; i < sideTaskList.length; i++) {
        await conn.insert('minetoken_tasks', {
          token_id: task.team_id,
          task_id: sideTaskList[i], // 多选
          type: 1, // 支线任务
          create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        });
      }
      await conn.commit();

      return {
        code: 0
      }
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(`updateTask error: ${e}`);
      return {
        code: -1,
        message: e
      }
    }
  }
}

module.exports = TaskService;
