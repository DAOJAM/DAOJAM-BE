'use strict';
const Controller = require('../../core/base_controller');

class StablecoinController extends Controller {
  async transfer() {
    const { ctx } = this;
    const { recipient, amount } = ctx.request.body;
    const result = await this.service.ethereum.stablecoin.transfer(recipient, amount);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
}

module.exports = StablecoinController;
