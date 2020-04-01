
'use strict';
const Service = require('egg').Service;
const moment = require('moment');

class ProjectService extends Service {
  async create({ pid, name, description, block_number, trx, owner }) {
    this.logger.info('Service: Project:: create start');
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const user = await this.app.mysql.get('user_accounts', { platform: 'eth', account: owner });
    let uid = 0;
    if (user) uid = user.uid;
    const result = await this.app.mysql.insert('daojam_project', {
      pid,
      uid,
      name,
      symbol: name,
      create_time: now,
      brief: description,
      introduction: description,
      block_number,
      trx,
      owner,
    });
    this.logger.info('Service: Project:: create end %j', result);
    return result;
  }
  async list(page, pagesize) {
    const sql = `SELECT * FROM daojam_project LIMIT :offset, :limit;
    SELECT count(1) as count FROM daojam_project;`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
    });
    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async get(pid) {
    return this.app.mysql.get('daojam_project', { pid });
  }
  async setLogo(id, logo) {
    return this.app.mysql.update('daojam_project', {
      id,
      logo,
    });
  }
  async setRepo(id, repo) {
    return this.app.mysql.update('daojam_project', {
      id,
      repo,
    });
  }
}

module.exports = ProjectService;
