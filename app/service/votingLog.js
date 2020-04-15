
'use strict';
const Service = require('egg').Service;
const moment = require('moment');

class VotingLogService extends Service {
  async create({ pid, uid, voter, weight, block_number, trx, block_hash }) {
    this.logger.info('Service: votingLog:: create start');
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    if (!uid) {
      const user = await this.app.mysql.get('user_accounts', { platform: 'eth', account: voter });
      if (user) uid = user.uid;
      else uid = 0;
    }
    const result = await this.app.mysql.insert('daojam_vote_log', {
      pid, voter, weight, block_number, trx,
      uid,
      create_time: now,
      block_hash,
    });
    this.logger.info('Service: votingLog:: create end %j', result);
    return result;
  }
  async list(page, pagesize) {
    const sql = `SELECT * FROM daojam_vote_log LIMIT :offset, :limit;
    SELECT count(1) as count FROM daojam_vote_log;`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
    });
    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async listByPid(pid, page, pagesize) {
    const sql = `SELECT * FROM daojam_vote_log
    WHERE pid = :pid
    LIMIT :offset, :limit;
    SELECT count(1) as count FROM daojam_vote_log WHERE pid = :pid;`;
    const result = await this.app.mysql.query(sql, {
      pid,
      offset: (page - 1) * pagesize,
      limit: pagesize,
    });
    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async listByUid(uid, page, pagesize) {
    this.ctx.logger.error('votinglog service listByUid', { uid, page, pagesize });
    try {
      let result = null;
      if (typeof page === 'string') page = parseInt(page);
      if (typeof pagesize === 'string') pagesize = parseInt(pagesize);

      const sql = `
          SELECT d.weight, d.create_time, d.trx, m.name, m.brief, m.logo, m.owner, m.uid, m.id, m.pid
          FROM daojam_vote_log d
          LEFT JOIN minetokens m
          ON d.pid = m.pid
          WHERE d.uid = :uid
          ORDER BY d.create_time DESC LIMIT :offset, :limit;
          SELECT COUNT(1) AS count FROM daojam_vote_log WHERE uid = :uid;`;
      result = await this.app.mysql.query(sql, {
        uid,
        offset: (page - 1) * pagesize,
        limit: pagesize,
      });
      this.ctx.logger.error('votinglog service listByUid result', result);
      return {
        list: result[0],
        count: result[1][0].count,
      };
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }
}

module.exports = VotingLogService;
