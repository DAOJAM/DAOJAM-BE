'use strict';

const Controller = require('egg').Controller;

class DefaultController extends Controller {
  async ping() {
    const { ctx, socket } = this;
    // const message = ctx.args[0];
    ctx.socket.emit('sendSocketId', socket.id);
  }

  async getNotification() {
    const { ctx } = this;
    // const message = ctx.args[0];
    this.logger.info('getNotification');
    for (const id of [ 1, 2, 3, 4, 5 ]) {
      ctx.socket.emit('push-notification', { id, message: `Notification ID${id}` });
    }
  }

  async getOverview() {
    const { ctx } = this;
    const message = ctx.args[0];
    this.logger.info('getOverview for:', message.uid);
    const overview = await this.service.notification.overviewFor(message.uid);
    ctx.socket.emit('setOverview', { overview, timestamp: new Date().getTime() });
  }
}

module.exports = DefaultController;
