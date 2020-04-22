'use strict';

const Controller = require('../core/base_controller');

class LeaderboardController extends Controller {
  async all() {
    const { ctx } = this;
    const { pagesize = 10, page = 1 } = ctx.query;
    const result = await this.service.leaderboard.all(parseInt(page), parseInt(pagesize));
    this.ctx.body = {
      ...this.ctx.msg.success,
      data: result,
    };
  }

  async userVotesRanking() {
    const { ctx } = this;
    const { pagesize = 10, page = 1 } = ctx.query;
    const result = await this.service.leaderboard.userVotesRanking(parseInt(page), parseInt(pagesize));
    this.ctx.body = {
      ...this.ctx.msg.success,
      data: result,
    };
  }
}

module.exports = LeaderboardController;
