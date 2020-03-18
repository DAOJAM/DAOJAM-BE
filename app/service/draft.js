'use strict';
const consts = require('./consts');

const Service = require('egg').Service;
const _ = require('lodash');
const moment = require('moment');

class DraftService extends Service {

  async draftList(uid, page, pagesize) {
    const countsql = 'SELECT COUNT(*) AS count FROM drafts d ';
    const listsql = 'SELECT d.id, d.uid, d.title, d.status, d.create_time, d.update_time, d.fission_factor,'
      + ' d.cover, d.is_original, d.tags, u.nickname, u.avatar FROM drafts d INNER JOIN users u ON d.uid = u.id ';

    const wheresql = 'WHERE d.uid = :uid AND d.status = 0 ';
    const ordersql = 'ORDER BY d.update_time DESC LIMIT :start, :end ';

    const sqlcode = countsql + wheresql + ';' + listsql + wheresql + ordersql + ';';
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { uid, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];
    const drafts = queryResult[1];

    return { count: amount[0].count, list: drafts };
  }

  async transferOwner(uid, draftid, current_uid) {
    const draft = await this.app.mysql.get('drafts', { id: draftid });
    if (!draft) {
      throw new Error('draft not found');
    }

    if (draft.uid !== current_uid) {
      throw new Error('not your draft');
    }

    const user = await this.service.account.binding.get2({ id: uid });
    // const user = await this.app.mysql.get('users', { id: uid });
    if (!user) {
      throw new Error('user not found');
    }

    if (!user.accept) {
      throw new Error('target user not accept owner transfer');
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.update('drafts', {
        uid: user.id,
      }, { where: { id: draft.id } });

      await conn.insert('post_transfer_log', {
        postid: draftid,
        fromuid: current_uid,
        touid: uid,
        type: 'draft',
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      this.ctx.logger.error(err);
      return false;
    }

    return true;
  }

}

module.exports = DraftService;
