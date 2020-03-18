'use strict';

const Controller = require('../core/base_controller');

class NotificationController extends Controller {
  async overview() {
    const ctx = this.ctx;
    ctx.body = ctx.msg.success;
    ctx.body.data = await this.service.notification.overview();
  }

  async fetch() {
    const ctx = this.ctx;
    try {
      const { provider, pageSize = 20, page = 1, timeType = 'check_time' } = ctx.query;
      const resp = await this.service.notification.fetch(provider, timeType, page, pageSize);

      if (resp === 1) {
        ctx.body = ctx.msg.failure;
        return;
      }

      if (resp === 2) {
        ctx.body = ctx.msg.userNotExist;
        return;
      }

      ctx.body = ctx.msg.success;
      ctx.body.data = resp;
    } catch (e) {
      ctx.body = ctx.msg.failure;
    }
  }

  async read() {
    const ctx = this.ctx;
    const provider = ctx.request.body ? ctx.request.body.provider : undefined;
    if (!provider) {
      ctx.body = ctx.msg.failure;
      return;
    }
    const resp = await this.service.notification.mark(provider, 'read_time');

    if (resp === 1 || resp === 3) {
      ctx.body = ctx.msg.failure;
      return;
    }

    if (resp === 2) {
      ctx.body = ctx.msg.userNotExist;
      return;
    }

    ctx.body = ctx.msg.success;
  }
}

module.exports = NotificationController;
