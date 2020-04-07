
'use strict';
const Service = require('egg').Service;
const moment = require('moment');

class VotingLogService extends Service {
  async create({ pid, uid, voter, weight, block_number, trx }) {
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
}

module.exports = VotingLogService;
