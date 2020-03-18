'use strict';
const moment = require('moment');
const _ = require('lodash');
const Service = require('egg').Service;

class SupportService extends Service {

  async create(userId, signId, contract, symbol, amount, referreruid, platform) {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const result = await this.app.mysql.query(
        'INSERT INTO supports (uid, signid, contract, symbol, amount, referreruid, platform, status, create_time) VALUES (?, ?, ?, ?, ?, ?, ? ,?, ?)',
        [ userId, signId, contract, symbol, amount, referreruid, platform, 0, now ]
      );

      const updateSuccess = result.affectedRows === 1;

      if (updateSuccess) {
        return result.insertId;
      }

      return -1;

    } catch (err) {
      this.ctx.logger.error('support error', err, userId, signId, symbol, amount);
      return -99;
    }
  }

  // 保存交易hash
  async saveTxhash(supportId, userId, hash) {
    const result = await this.app.mysql.update('supports', {
      txhash: hash,
    }, { where: { id: supportId, uid: userId } });

    return result;
  }

  async getByUserId(userId, signId) {
    return await this.app.mysql.get('supports', { uid: userId, signid: signId, status: 1 });
  }

  // 转移到CommentService，待删除
  async commentList(signid, page = 1, pagesize = 20) {

    this.app.mysql.queryFromat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };

    if (!signid) {
      return null;
    }

    const sql = 'SELECT s.id as payId, s.amount, s.platform, s.signid, s.create_time, s.num, s.action, u.id, u.username, u.nickname, u.avatar, c.comment '
      + 'FROM ( '
      + 'SELECT id,uid,signId,amount,num,platform,create_time,status,2 AS action FROM orders WHERE signId = :signid '
      + 'UNION ALL '
      + 'SELECT id,uid,signId,amount,0 AS num,platform,create_time,status,1 AS action FROM supports WHERE signId = :signid '
      + ') s '
      + 'LEFT JOIN users u ON s.uid = u.id '
      + 'LEFT JOIN comments c ON c.sign_id = s.signid  AND c.uid = s.uid AND s.action=1 '
      + 'WHERE s.status = 1 ORDER BY s.create_time DESC LIMIT :start, :end;';
    const results = await this.app.mysql.query(
      sql,
      // 'SELECT s.amount, s.platform, s.signid, s.create_time, u.id, u.username, u.nickname, u.avatar, c.comment FROM supports s '
      // // 一个user在同一篇文章下的comment和support
      // + 'LEFT JOIN users u ON s.uid = u.id '
      // + 'LEFT JOIN comments c ON c.sign_id = s.signid AND c.uid = u.id '
      // + 'WHERE s.status = 1 AND s.signid = :signid ORDER BY s.create_time DESC limit :start, :end;',
      { signid, start: (page - 1) * pagesize, end: pagesize }
    );

    _.each(results, row => {
      if (row.comment === null) {
        row.comment = '';
      }
    });

    return results;
  }

}

module.exports = SupportService;
