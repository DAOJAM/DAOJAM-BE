
'use strict';
const Service = require('egg').Service;
const moment = require('moment');

class MintLogService extends Service {
  async create({ uid, address, daot, block_number, trx }) {
    this.logger.info('Service: votingLog:: create start');
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const result = await this.app.mysql.insert('daojam_mint_log', {
      uid, address, daot, block_number, trx,
      create_time: now,
    });
    this.logger.info('Service: votingLog:: create end %j', result);
    return result;
  }
  async list(page, pagesize) {
    const sql = `SELECT * FROM daojam_mint_log LIMIT :offset, :limit;
    SELECT count(1) as count FROM daojam_mint_log;`;
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

module.exports = MintLogService;
