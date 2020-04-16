
'use strict';
const Service = require('egg').Service;
const moment = require('moment');

class ProjectService extends Service {
  async create({ pid, name, description, introduction, logo, cover, repo, block_number, trx, owner, block_hash }) {
    this.logger.info('Service: Project:: create start');
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const user = await this.app.mysql.get('user_accounts', { platform: 'near', account: owner });
    let uid = 0;
    if (user) uid = user.uid;
    const result = await this.app.mysql.insert('minetokens', {
      pid,
      uid,
      name,
      symbol: name,
      create_time: now,
      brief: description,
      introduction,
      logo,
      cover,
      repo,
      block_number,
      trx,
      block_hash,
      owner,
    });
    await this.service.token.mineToken.setTeamOwner(result.insertId, uid);

    this.logger.info('Service: Project:: create end %j', result);
    return result;
  }
  async list(page, pagesize) {
    try {
      const sql = `
      SELECT t1.*, SUM(t2.weight) as weight, SUM(POW(t2.weight,2)) as daot, count(1) AS supporter FROM minetokens t1
      LEFT JOIN daojam_vote_log t2
      ON t1.pid = t2.pid
      GROUP BY pid
      LIMIT :offset, :limit;
      SELECT count(1) as count FROM minetokens;`;
      const result = await this.app.mysql.query(sql, {
        offset: (page - 1) * pagesize,
        limit: pagesize,
      });

      // 查询团队成员数量
      const list = result[0];
      if (result) {
        for (let i = 0; i < list.length; i++) {
          const sql = 'SELECT COUNT(1) AS members FROM (SELECT * FROM minetoken_teams WHERE token_id = ? AND `status` = 1) AS a';
          const resultTeams = await this.app.mysql.query(sql, [ list[i].id ]);
          list[i].members = resultTeams[0].members;
        }
      }
      return {
        count: result[1][0].count,
        list,
      };
    } catch (e) {
      return {
        count: 0,
        list: [],
      };
    }
  }
  async get(id) {
    const p = await this.app.mysql.get('minetokens', { id });
    const sql = `
      SELECT IFNULL(SUM(weight), 0) as weight, IFNULL(SUM(POW(weight,2)), 0) as daot
      FROM daojam_vote_log
      WHERE pid = :pid;`;
    const weight = await this.app.mysql.query(sql, {
      pid: p.pid,
    });
    return {
      ...p,
      ...weight[0],
    };
  }
  async setLogo(id, logo) {
    return this.app.mysql.update('minetokens', {
      id,
      logo,
    });
  }
  async setRepo(id, repo) {
    return this.app.mysql.update('minetokens', {
      id,
      repo,
    });
  }
}

module.exports = ProjectService;
