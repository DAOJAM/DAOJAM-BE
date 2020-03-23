'use strict';

const Service = require('egg').Service;

class JobService extends Service {
  /**
   * 根据用户id获取用户身份列表
   * @param {*} uid 用户id
   * @return {Array} array
   * @memberof JobService
   */
  async list(uid) {
    const result = await this.app.mysql.query(
      `SELECT * FROM user_job uj 
      LEFT JOIN dao_jam_job j 
      ON uj.jid = j.id
      WHERE uj.uid = :uid;`,
      {
        uid,
      }
    );
    return result;
  }

  /**
   * 用户创建身份
   * @param {Array} creates 格式 [{ uid, jid, value }]
   * @return {status, msg} 返回创建成功或者失败
   * @memberof JobService
   */
  async create(creates) {
    let result = null;
    const conn = await this.app.mysql.beginTransaction();

    try {
      // 删除用户的所有身份
      await conn.delete('user_job', {
        uid: creates[0].uid // 使用第一个数组的uid
      });

      // 创建身份
      const res = await conn.insert(
        'user_job',
        creates
      );

      await conn.commit();

      this.ctx.logger.info('service.dao.job.update result', res);

      result = {
        status: true,
        msg: res.affectedRows,
      };
    } catch (error) {
      await conn.rollback();
      result = {
        status: false,
        msg: error.code,
      };
      this.ctx.logger.error('service.dao.job.create error', error);
    }
    return result;
  }

  /**
   * 更新用户身份
   * @param {*} uid 用户id
   * @param {*} jid 身份id
   * @param {*} value 数值
   * @return {string} 更新结果
   * @memberof JobService
   */
  async update(uid, jid, value) {
    const result = await this.app.mysql.query(
      'UPDATE user_job SET \`value\` = :value WHERE uid = :uid AND jid = :jid; ',
      {
        uid,
        jid,
        value,
      }
    );
    this.ctx.logger.info('service.dao.job.update result', result);
    return result.changedRows;
  }

  /**
   * 删除用户身份
   * @param {*} uid 用户id
   * @param {*} jid 身份id
   * @return {string} 删除结果
   * @memberof JobService
   */
  async delete(uid, jid) {
    const result = await this.app.mysql.query(
      'DELETE FROM user_job WHERE uid = :uid AND jid = :jid; ',
      {
        uid,
        jid,
      }
    );
    this.ctx.logger.info('service.dao.job.delete result', result);
    return result.affectedRows;
  }

  /**
   * 根据id获取dao_jam_job的某条数据
   * @param {Number} id jid
   * @return {Object} 返回某条数据结果
   * @memberof JobService
   */
  async get(id) {
    return this.app.mysql.get('dao_jam_job', { id });
  }

  /**
   * 获取表：dao_jam_job中所有数据
   * @return {Array} 数据list
   * @memberof JobService
   */
  async getAll() {
    return this.app.mysql.select('dao_jam_job');
  }
}

module.exports = JobService;
