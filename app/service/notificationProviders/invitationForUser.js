'use strict';

const Service = require('egg').Service;
const _ = require('lodash');
const moment = require('moment');

/**
 * 查询某用户被其他项目的邀请情况
 */
class InviteNotification extends Service {

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

  // 提供推送信息
  async populateNotifications(userId, fromDate, page, pageSize) {
    fromDate = moment.isMoment(fromDate) ? fromDate.format('YYYY-MM-DD HH:mm:ss') : undefined;
    const applications = await this.ctx.app.mysql.query(
      `select m_team.id as requestId, u.avatar, u.nickname,
      mt.name as projectName, m_team.create_time, m_team.status
      from minetoken_teams as m_team
      join users as u on u.id = m_team.uid
      join minetokens as mt on mt.id = m_team.token_id
      where m_team.note = 'invite' and m_team.uid = :userId
      ${fromDate ? 'AND m_team.create_time > :fromDate' : ''}
      ORDER BY create_time DESC LIMIT :start, :end `,
      {
        userId, fromDate, start: (page - 1) * pageSize, end: 1 * pageSize,
      });
    return _.map(applications, _app => {
      return {
        kind: 'teamInviteRequest',
        requestId: _app.requestId,
        timestamp: _app.create_time,
        message: _app.projectName,
        avatar: _app.avatar,
        isApproved: _app.status === 1,
        actions: _app.status === 0 ? [{ name: 'approve' }, { name: 'deny' }] : [],
      };
    });
  }

}

module.exports = InviteNotification;
