
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
  async list(page, pagesize, sort = 'votes', search = '', bookmarkUid = 0) {
    try {
      // 排序
      const sortOrderList = {
        votes: 'ORDER BY SUM(t2.weight) DESC, t1.create_time ASC',
        createTime: 'ORDER BY t1.create_time DESC',
        name: 'ORDER BY CONVERT(t1.name USING GBK) ASC',
      };
      const sortOrder = sortOrderList[sort] ? sortOrderList[sort] : '';

      // 筛选星标
      let filterBookmarks = [ '', '' ];
      if (bookmarkUid) {
        if (Number.isNaN(bookmarkUid)) return false;
        filterBookmarks = [
          'JOIN minetoken_bookmarks b ON b.token_id = t1.id AND b.uid = :bookmarkUid',
          'JOIN minetoken_bookmarks b ON b.token_id = c1.id AND b.uid = :bookmarkUid',
        ];
      }
      // 搜索
      let whereOrder = [ '', '' ];
      if (search !== '') {
        whereOrder = [
          'WHERE Lower(t1.name) LIKE :search OR Lower(t1.brief) LIKE :search',
          'WHERE Lower(c1.name) LIKE :search OR Lower(c1.symbol) LIKE :search',
        ];
      }

      const sql = `
      SELECT t1.*, SUM(t2.weight) as weight, SUM(POW(t2.weight,2)) as daot, count(DISTINCT t2.uid) AS supporter FROM minetokens t1
      LEFT JOIN daojam_vote_log t2
      ON t1.pid = t2.pid
      ${filterBookmarks[0]}
      ${whereOrder[0]}
      GROUP BY pid
      ${sortOrder}
      LIMIT :offset, :limit;
      SELECT count(1) as count FROM minetokens c1
      ${filterBookmarks[1]}
      ${whereOrder[1]};`;

      const result = await this.app.mysql.query(sql, {
        offset: (page - 1) * pagesize,
        limit: pagesize,
        bookmarkUid,
        search: '%' + search.toLowerCase() + '%',
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
      this.logger.error(e);
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
      WHERE pid = :pid;

      SELECT count(1) as stars
      FROM minetoken_bookmarks
      WHERE token_id = :id;`;
    const additional = await this.app.mysql.query(sql, {
      pid: p.pid,
      id: p.id
    });
    return {
      ...p,
      // weight, daot
      ...additional[0],
      // stars
      ...additional[1][0]
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
