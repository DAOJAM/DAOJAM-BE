'use strict';

const Service = require('egg').Service;

class SkillService extends Service {
  /**
   * 根据用户id获取用户身份列表
   * @param {*} uid 用户id
   * @return {Array} array
   * @memberof SkillService
   */
  async list(uid) {
    const result = await this.app.mysql.query(
      `SELECT * FROM user_skill uj 
      LEFT JOIN dao_jam_skill s 
      ON uj.sid = s.id
      WHERE uj.uid = :uid;`,
      {
        uid,
      }
    );
    return result;
  }

  /**
   * 用户创建身份
   * @param {Array} creates 格式 [{ uid, sid, value }]
   * @return {status, msg} 返回创建成功或者失败
   * @memberof SkillService
   */
  async create(creates) {
    let result = null;
    try {
      const res = await this.app.mysql.insert(
        'user_skill',
        creates
      );
      this.ctx.logger.info('service.dao.skill.update result', res);
      result = {
        status: true,
        msg: res.affectedRows,
      };
    } catch (error) {
      result = {
        status: false,
        msg: error.code,
      };
      this.ctx.logger.error('service.dao.skill.create error', error);
    }
    return result;
  }

  /**
   * 更新用户身份
   * @param {*} uid 用户id
   * @param {*} sid 身份id
   * @param {*} value 数值
   * @return {string} 更新结果
   * @memberof SkillService
   */
  async update(uid, sid, value) {
    const result = await this.app.mysql.query(
      'UPDATE user_skill SET \`value\` = :value WHERE uid = :uid AND sid = :sid; ',
      {
        uid,
        sid,
        value,
      }
    );
    this.ctx.logger.info('service.dao.skill.update result', result);
    return result.changedRows;
  }

  /**
   * 删除用户身份
   * @param {*} uid 用户id
   * @param {*} sid 身份id
   * @return {string} 删除结果
   * @memberof SkillService
   */
  async delete(uid, sid) {
    const result = await this.app.mysql.query(
      'DELETE FROM user_skill WHERE uid = :uid AND sid = :sid; ',
      {
        uid,
        sid,
      }
    );
    this.ctx.logger.info('service.dao.skill.delete result', result);
    return result.affectedRows;
  }

  /**
   * 根据id获取dao_jam_skill的某条数据
   * @param {Number} id sid
   * @return {Object} 返回某条数据结果
   * @memberof SkillService
   */
  async get(id) {
    return this.app.mysql.get('dao_jam_skill', { id });
  }

  /**
   * 获取表：dao_jam_skill中所有数据
   * @return {Array} 数据list
   * @memberof SkillService
   */
  async getAll() {
    return this.app.mysql.select('dao_jam_skill');
  }
}

module.exports = SkillService;
