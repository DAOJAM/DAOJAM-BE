const Controller = require('../core/base_controller');

class VotingController extends Controller {
  /**
   * 用户领取赠票
   * @memberof VotingController
   */
  async mint() {
    const ctx = this.ctx;
    const amount = 100; // 每天可领赠票的数量
    const user = await this.service.account.binding.get(ctx.user.id, 'near');
    if (!user) {
      ctx.body = ctx.msg.failure;
      return;
    }
    const result = await this.service.nearprotocol.rawMint(user.account, amount);
    // const result = await this.service.voting._mint(user.account, amount);
    await this.service.mintLog.create({
      uid: ctx.user.id, address: user.account, daot: amount, block_number: result.blockHash, trx: result.txHash,
    });
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async balance() {
    const ctx = this.ctx;
    const user = await this.service.account.binding.get(ctx.user.id, 'near');
    if (!user) {
      ctx.body = {
        ...ctx.msg.success,
        data: 0,
      };
      return;
    }
    const balance = await this.service.nearprotocol.balance(user.account);
    ctx.body = {
      ...ctx.msg.success,
      data: balance,
    };
  }
  async userLog() {
    const ctx = this.ctx;
    const { page = 1, pagesize = 20 } = this.ctx.query;
    const uid = ctx.user.id;
    const data = await this.service.votingLog.listByUid(uid, page, pagesize);
    ctx.body = {
      ...ctx.msg.success,
      data,
    };
  }
  async mintLog() {
    const ctx = this.ctx;
    const { page = 1, pagesize = 20 } = this.ctx.query;
    const uid = ctx.user.id;
    const data = await this.service.votingLog.mintLog(uid, page, pagesize);
    const user = await this.service.account.binding.get(uid, 'near');
    const balance = await this.service.nearprotocol.balance(user.account);
    data.balance = balance;
    ctx.body = {
      ...ctx.msg.success,
      data,
    };
  }
}
module.exports = VotingController;
