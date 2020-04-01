const Controller = require('../core/base_controller');

class VotingController extends Controller {
  /**
   * 用户领取赠票
   * @memberof VotingController
   */
  async mint() {
    const ctx = this.ctx;
    // 需要根据用户id查找用户的address
    // const uid = ctx.user.id;
    const { address } = ctx.request.body;
    const amount = 100; // 每天可领赠票的数量
    const result = await this.service.voting._mint(address, amount);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
}
module.exports = VotingController;
