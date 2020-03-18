'use strict';
const _ = require('lodash');
const moment = require('moment');
const consts = require('../service/consts');
const Service = require('egg').Service;

class CommentService extends Service {

  constructor(ctx, app) {
    super(ctx, app);
    this.app.mysql.queryFromat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };
  }

  // 付费评论
  async payPointCreate(userId, username, signId, comment, ip) {
    const result = await this.service.mining.comment(userId, signId, ip);
    // 积分扣除成功
    if (result < 0) {
      return result;
    }

    await this.create(userId, username, signId, comment, consts.commentTypes.point, result);
    return 0;
  }

  // 创建评论
  async create(userId, username, signId, comment, type, refId) {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const result = await this.app.mysql.insert('comments', {
      username,
      uid: userId,
      sign_id: signId,
      comment,
      type,
      ref_id: refId,
      create_time: now,
    });

    return result.affectedRows === 1;
  }

  // 评论列表
  async commentList(signid, page = 1, pagesize = 20) {
    if (!signid) {
      return null;
    }

    const post = await this.service.post.get(signid);
    if (!post) {
      return null;
    }

    let sql;
    if (post.channel_id === 1) {
      sql = 'SELECT c.id, c.uid, c.comment,c.create_time, u.username, u.nickname, u.avatar FROM comments c  '
        + 'LEFT JOIN users u ON c.uid = u.id '
        + 'WHERE c.sign_id = :signid AND c.type=3 ORDER BY c.create_time DESC LIMIT :start, :end;'
        + 'SELECT count(1) as count FROM comments c WHERE c.sign_id = :signid AND c.type=3;';
    } else {
      // tudo：会有性能问题，需要优化，comments表增加status字段，增加其它展示信息，避免查询orders、supports、assets_points_log表
      sql = 'SELECT s.id, s.amount, s.platform, s.signid, s.create_time, s.num, s.action, s.uid, u.username, u.nickname, u.avatar, c.comment '
        + 'FROM ( '
        + 'SELECT id,uid,signid,amount,num,platform,create_time,status,2 AS action FROM orders WHERE signId = :signid '
        + 'UNION ALL '
        + 'SELECT id,uid,signid,amount,0 AS num,platform,create_time,status,1 AS action FROM supports WHERE signId = :signid '
        // + 'UNION ALL '
        // + 'SELECT id,uid,sign_id AS signid,-amount,0 AS num,\'point\' AS platform,create_time,status,3 AS action FROM assets_points_log WHERE sign_id=:signid and type=\'comment_pay\' '
        + ') s '
        + 'LEFT JOIN users u ON s.uid = u.id '
        + 'LEFT JOIN comments c ON c.type=s.action and c.ref_id = s.id '
        + 'WHERE s.status = 1 ORDER BY s.create_time DESC LIMIT :start, :end;'
        + 'SELECT count(1) as count '
        + 'FROM ( '
        + 'SELECT id,uid,signid,amount,num,platform,create_time,status,2 AS action FROM orders WHERE signId = :signid '
        + 'UNION ALL '
        + 'SELECT id,uid,signid,amount,0 AS num,platform,create_time,status,1 AS action FROM supports WHERE signId = :signid '
        // + 'UNION ALL '
        // + 'SELECT id,uid,sign_id AS signid,-amount,0 AS num,\'point\' AS platform,create_time,status,3 AS action FROM assets_points_log WHERE sign_id=:signid and type=\'comment_pay\' '
        + ') s '
        + 'WHERE s.status = 1;';
    }

    const results = await this.app.mysql.query(
      sql,
      // 'SELECT s.amount, s.platform, s.signid, s.create_time, u.id, u.username, u.nickname, u.avatar, c.comment FROM supports s '
      // // 一个user在同一篇文章下的comment和support
      // + 'LEFT JOIN users u ON s.uid = u.id '
      // + 'LEFT JOIN comments c ON c.sign_id = s.signid AND c.uid = u.id '
      // + 'WHERE s.status = 1 AND s.signid = :signid ORDER BY s.create_time DESC limit :start, :end;',
      { signid, start: (page - 1) * pagesize, end: pagesize }
    );

    _.each(results[0], row => {
      if (row.comment === null) {
        row.comment = '';
      }

      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: results[1][0].count,
      list: results[0],
    };
  }

}

module.exports = CommentService;
