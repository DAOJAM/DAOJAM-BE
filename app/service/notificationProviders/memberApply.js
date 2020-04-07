'use strict';

const Service = require('egg').Service;
const _ = require('lodash');
const moment = require('moment');

class ApplyNotification extends Service {

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
      m_team.content, m_team.create_time, m_team.status, m_team.contact
      from minetoken_teams as m_team
      join users as u on u.id = m_team.uid
      where m_team.note = 'apply'
      and m_team.token_id = (
        select id from minetokens where uid = :userId
      ) ${fromDate ? 'AND m_team.create_time > :fromDate' : ''}
      ORDER BY create_time DESC LIMIT :start, :end `,
      {
        userId, fromDate, start: (page - 1) * pageSize, end: 1 * pageSize,
      });
    return _.map(applications, _app => {
      return {
        kind: 'teamApplyRequest',
        requestId: _app.requestId,
        timestamp: _app.create_time,
        applicant: {
          nickname: _app.nickname,
          avatar: _app.avatar,
          contact: _app.contact,
        },
        message: _app.content,
        isApproved: _app.status === 1,
        actions: _app.status === 0 ? [{ name: 'approve' }, { name: 'deny' }] : [],
      };
    });
  }

}

module.exports = ApplyNotification;
