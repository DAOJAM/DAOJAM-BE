'use strict';

const Service = require('egg').Service;

class DaoCommentService extends Service {
  /**
   * 根据项目id获取评论列表
   * @param {number | string} projectId 项目的ID
   * @return {Array<Comment>} array
   */
  async getList(projectId) {
    // @todo: 后续数据多了可能需要做分页
    this.logger.info('projectId', projectId);
    let result = await this.app.mysql.query(
      `select * from project_comments
      where projectId = :projectId
      order by createdAt DESC;`,
      {
        projectId: Number(projectId),
      }
    );
    result = result.map(({ createdAt, ...rest }) => {
      return { ...rest, createdAt: new Date(createdAt).toISOString() };
    });
    return result;
  }

  get(id) {
    return this.app.mysql.get('project_comments', { id });
  }

  /**
   * Delete comment
   * @param {number|string} id 评论的ID
   */
  delete(id) {
    return this.app.mysql.delete('project_comments', { id });
  }

  /**
   * create 创建评论
   * @param {number | string} uid 用户的 ID
   * @param {number | string} projectId 项目的ID
   * @param {string} content 评论的内容
   */
  async create(uid, projectId, content) {
    // egg-mysql 与数据库的 Timestamp 联动有点诡异，改用 bigint 存储时间戳
    const createdAt = new Date().getTime();
    this.logger.info('createdAt', createdAt);
    const result = await this.app.mysql.insert('project_comments', {
      uid,
      projectId,
      content,
      createdAt,
    });
    return result;
  }

  /**
   * 根据用户id获取他的评论
   * @param {number | string} uid 用户ID
   * @return {Array<Comment>} array
   * @memberof DaoCommentService
   */
  async commentsOf(uid) {
    // @todo: 后续数据多了可能需要做分页
    const result = await this.app.mysql.query(
      `select * from project_comments
      where uid = :uid
      order by createdAt DESC;`,
      {
        uid: Number(uid),
      }
    );
    return result;
  }

  /**
   * 获取目前所有项目的评论
   * @return {Array} 数据list
   */
  async getAll() {
    return this.app.mysql.select('project_comments');
  }
}

module.exports = DaoCommentService;
