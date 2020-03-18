'use strict';

const Controller = require('../core/base_controller');

const moment = require('moment');
const _ = require('lodash');

class DraftsController extends Controller {

  constructor(ctx) {
    super(ctx);
  }

  // 获取草稿列表
  async drafts() {
    const ctx = this.ctx;

    const { page = 1, pagesize = 20 } = ctx.query;

    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    const draftList = await this.service.draft.draftList(ctx.user.id, page, pagesize);

    ctx.body = ctx.msg.success;
    ctx.body.data = draftList;
  }


  // 保存草稿
  async save() {
    const ctx = this.ctx;

    const { id = '', title = '', content = '', cover, fissionFactor = 2000, is_original = 0, tags = '', commentPayPoint = 0 } = ctx.request.body;

    // 评论需要支付的积分
    const comment_pay_point = parseInt(commentPayPoint);
    if (comment_pay_point > 99999 || comment_pay_point < 1) {
      ctx.body = ctx.msg.pointCommentSettingError;
      return;
    }

    // 有id视为保存草稿， 没有id视为一篇新的草稿
    if (id) {
      await this.save_draft(this.ctx.user.id, id, title, content, cover, fissionFactor, is_original, tags, comment_pay_point);
    } else {
      await this.create_draft(this.ctx.user.id, title, content, cover, fissionFactor, is_original, tags, comment_pay_point);
    }
  }

  // 更新一篇已经存在的草稿
  async save_draft(uid, id, title, content, cover, fissionFactor, is_original, tags, comment_pay_point) {
    const draft = await this.app.mysql.get('drafts', { id });

    if (!draft) {
      this.ctx.body = this.ctx.msg.draftNotFound;
      return;
    }

    if (draft.uid !== uid) {
      this.ctx.body = this.ctx.msg.notYourDraft;
      return;
    }

    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const result = await this.app.mysql.update('drafts', {
        title,
        content,
        cover,
        fission_factor: fissionFactor,
        update_time: now,
        is_original,
        tags,
        comment_pay_point,
      }, { where: { id } });

      const updateSuccess = result.affectedRows === 1;

      if (updateSuccess) {
        this.ctx.body = this.ctx.msg.success;
      } else {
        this.ctx.logger.error('save draft err ');
        this.ctx.body = this.ctx.msg.failure;
      }

    } catch (err) {
      this.ctx.logger.error(err.sqlMessage);
      this.ctx.body = this.ctx.msg.failure;
    }
  }

  // 创建新的草稿
  async create_draft(uid, title, content, cover, fissionFactor, is_original, tags, comment_pay_point) {

    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const result = await this.app.mysql.insert('drafts', {
        uid,
        title,
        content,
        cover,
        fission_factor: fissionFactor,
        is_original,
        create_time: now,
        update_time: now,
        tags,
        comment_pay_point,
      });

      const updateSuccess = result.affectedRows === 1;

      if (updateSuccess) {
        this.ctx.logger.info('create draft success ..');
        this.ctx.body = this.ctx.msg.success;
        this.ctx.body.data = result.insertId;

      } else {
        this.ctx.logger.error('create draft err ');
        this.ctx.body = this.ctx.msg.failure;
      }

    } catch (err) {
      this.ctx.logger.error(err.sqlMessage);
      this.ctx.body = this.ctx.msg.failure;
    }
  }

  // 获取一篇草稿
  async draft() {
    const id = this.ctx.params.id;

    const draft = await this.app.mysql.get('drafts', { id });

    if (!draft) {
      this.ctx.body = this.ctx.msg.draftNotFound;
      return;
    }

    if (draft.uid !== this.ctx.user.id) {
      this.ctx.body = this.ctx.msg.notYourDraft;
      return;
    }

    // 分配标签
    let tag_arr = draft.tags.split(',');
    tag_arr = tag_arr.filter(x => { return x !== ''; });
    let tags = [];
    if (tag_arr.length > 0) {
      tags = await await this.app.mysql.query(
        'select id, name from tags where id in (?) ',
        [ tag_arr ]
      );
    }
    draft.tags = tags;

    this.ctx.body = this.ctx.msg.success;
    this.ctx.body = draft;
  }

  // 删除草稿
  async delete() {
    const id = this.ctx.params.id;

    const draft = await this.app.mysql.get('drafts', { id });

    if (!draft) {
      this.ctx.body = this.ctx.msg.draftNotFound;
      return;
    }

    if (draft.uid !== this.ctx.user.id) {
      this.ctx.body = this.ctx.msg.notYourDraft;
      return;
    }

    const result = await this.app.mysql.update('drafts', { status: 1 }, { where: { id } });

    const updateSuccess = result.affectedRows === 1;

    if (updateSuccess) {
      this.ctx.body = this.ctx.msg.success;
    } else {
      this.ctx.body = this.ctx.msg.failure;
    }

  }

  // 转让草稿
  async transferOwner() {
    const ctx = this.ctx;
    const { uid, draftid } = ctx.request.body;

    const success = await this.service.draft.transferOwner(uid, draftid, ctx.user.id);

    if (success) {
      ctx.body = ctx.msg.success;
    } else {
      ctx.body = ctx.msg.failure;
    }
  }

}

module.exports = DraftsController;
