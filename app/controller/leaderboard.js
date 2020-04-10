'use strict';

const Controller = require('../core/base_controller');

class LeaderboardController extends Controller {
  async all() {
    const result = await this.service.leaderboard.all();
    this.ctx.body = {
      ...this.ctx.msg.success,
      data: result,
    };
  }
}

module.exports = LeaderboardController;
