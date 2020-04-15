'use strict';
const Service = require('egg').Service;

class LeaderboardService extends Service {
  async all() {
    try {
      const sql = `SELECT d.pid, d.uid, SUM(d.weight) AS weight, SUM(POW(d.weight,2)) AS daot, m.logo, m.name, m.id
      FROM daojam_vote_log d, minetokens m
      WHERE d.pid = m.pid
      GROUP BY pid ORDER BY weight DESC, daot DESC;`;

      return await this.app.mysql.query(sql);
    } catch (e) {
      this.ctx.logger.error(`task fail: ${e}`);
      return [];
    }
  }
}

module.exports = LeaderboardService;
