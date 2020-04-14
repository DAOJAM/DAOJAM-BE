
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

    // 设置团队拥有者
    // const setTeamOwner = async (tokenId, uid) => {
    //   const conn = await this.app.mysql.beginTransaction();

    //   try {
    //     // 查询
    //     const sqlSelect = 'SELECT * FROM minetoken_teams WHERE token_id = ? AND uid = ?;';
    //     const SelectResult = await conn.query(sqlSelect, [ tokenId, uid ]);
    //     if (SelectResult.length === 0) {
    //       // 没有记录 插入
    //       const sql = `INSERT INTO minetoken_teams (token_id, uid, \`status\`, note, create_time)
    //                     VALUES (?, ?, ?, ?, ?);`;
    //       const result = await conn.query(sql, [ tokenId, uid, 1, 'owner', moment().format('YYYY-MM-DD HH:mm:ss') ]);
    //       await conn.commit();

    //       if (result.affectedRows === 1) {
    //         return 0;
    //       }
    //       return -1;

    //     }
    //     // 有记录 更新数据
    //     const sql = `UPDATE minetoken_teams SET token_id = ?, uid = ?, status = ?, note = ?, create_time = ?
    //                             WHERE token_id = ? AND uid = ?;`;
    //     const result = await conn.query(sql, [ tokenId, uid, 1, 'owner', moment().format('YYYY-MM-DD HH:mm:ss'), tokenId, uid ]);
    //     await conn.commit();

    //     if (result.affectedRows === 1) {
    //       return 0;
    //     }
    //     return -1;


    //   } catch (e) {
    //     console.log(e);
    //     await conn.rollback();
    //     this.ctx.logger.error(`setTeamOwner error: ${e}`);
    //   }
    // };

    // team 写入拥有者
    // await setTeamOwner(pid, uid);

    this.logger.info('Service: Project:: create end %j', result);
    return result;
  }
  async list(page, pagesize) {
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
    return {
      count: result[1][0].count,
      list: result[0],
    };
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
