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
    // const { address } = ctx.request.body;
    const amount = 100; // 每天可领赠票的数量
    const user = await this.service.account.binding.get(ctx.user.id, 'eth');
    if (!user) {
      ctx.body = ctx.msg.failure;
      return;
    }
    const result = await this.service.voting._mint(user.account, amount);
    await this.service.mintLog.create({
      uid: ctx.user.id, address: user.account, daot: amount, block_number: result.blockNumber, trx: result.transactionHash,
    });
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async balance() {
    const ctx = this.ctx;
    const user = await this.service.account.binding.get(ctx.user.id, 'eth');
    if (!user) {
      ctx.body = {
        ...ctx.msg.success,
        data: 0,
      };
      return;
    }
    const balance = await this.service.voting.balance(user.account);
    ctx.body = {
      ...ctx.msg.success,
      data: balance,
    };
  }
}
module.exports = VotingController;
