'use strict';
const Service = require('egg').Service;

class LeaderboardService extends Service {
  async all(page, pagesize) {
    try {
      const sql = `SELECT d.pid, d.uid, SUM(d.weight) AS weight, SUM(POW(d.weight,2)) AS daot, m.logo, m.name, m.id
      FROM daojam_vote_log d, minetokens m
      WHERE d.pid = m.pid
      GROUP BY pid ORDER BY weight DESC, daot DESC
      LIMIT :offset, :limit;
      
      SELECT 
        count(1) as count
      FROM
        minetokens`;

      const result = await this.app.mysql.query(sql, {
        offset: (page - 1) * pagesize,
        limit: pagesize
      });

      return {
        count: result[1][0].count,
        list: result[0]
      }
    } catch (e) {
      this.ctx.logger.error(`task fail: ${e}`);
      return {
        count: 0,
        list: [],
      };
    }
  }

  async userVotesRanking(page, pagesize) {
    try {
      const sql = `
        SELECT
          t2.id, t2.username, t2.nickname, t2.avatar,
          SUM(t1.weight) AS weight,
          SUM(POW(t1.weight,2)) AS daot
        FROM
          daojam_vote_log t1
        LEFT JOIN
          users t2 ON t1.uid = t2.id
        GROUP BY
          uid
        ORDER BY
          SUM(t1.weight) DESC, SUM(POW(t1.weight,2)) DESC
        LIMIT :offset, :limit;

        SELECT 
          count(1) as count
        FROM
        (
          SELECT
            count(*)
          FROM
            daojam_vote_log t1
          LEFT JOIN
            users t2 ON t1.uid = t2.id
          GROUP BY
            uid
        ) a;`;

      const result = await this.app.mysql.query(sql, {
        offset: (page - 1) * pagesize,
        limit: pagesize
      });

      return {
        count: result[1][0].count,
        list: result[0]
      }
    } catch (e) {
      this.ctx.logger.error(`task fail: ${e}`);
      return {
        count: 0,
        list: [],
      };
    }
  }
}

module.exports = LeaderboardService;
