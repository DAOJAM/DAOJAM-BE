const Controller = require('../core/base_controller');

class NearController extends Controller {
  /**
   * 用户领取赠票
   * @memberof NearController
   */
  async mint() {
    const ctx = this.ctx;
    const amount = 100; // 每天可领赠票的数量
    const user = await this.service.account.binding.get(ctx.user.id, 'near');
    if (!user) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '没有绑定near',
      };
      return;
    }
    const result = await this.service.nearprotocol.mint(user.account, amount);
    // const result = await this.service.voting._mint(user.account, amount);
    await this.service.mintLog.create({
      uid: ctx.user.id, address: user.account, daot: amount, block_number: 0, trx: '0',
    });
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async createProposal() {
    const ctx = this.ctx;
    const { id, txHash, blockHash } = ctx.request.body;
    const p = await this.service.nearprotocol.getProposal(id);
    if (!p) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '项目未同步到near',
      };
      return;
    }
    const existence = await this.app.mysql.get('minetokens', { pid: id });
    if (existence) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '项目已存在',
      };
      return;
    }
    const { name, creator, description } = p;
    const result = await this.service.project.create({
      pid: id,
      name,
      description,
      block_number: 0,
      trx: txHash,
      block_hash: blockHash,
      owner: creator,
    });
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async vote() {
    const ctx = this.ctx;
    const { id, txHash, blockHash } = ctx.request.body;
    const uid = ctx.user.id;
    const user = await this.service.account.binding.get(uid, 'near');
    if (!user) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '没有绑定near',
      };
      return;
    }
    const p = await this.service.nearprotocol.getProposal(id);
    if (!p) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '项目未同步到near',
      };
      return;
    }
    if (!p.voters[user.account]) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '您尚未投票',
      };
      return;
    }
    const existence = await this.app.mysql.get('daojam_vote_log', { pid: id, uid });
    if (existence) {
      ctx.body = {
        ...ctx.msg.failure,
        message: '投票已存在',
      };
      return;
    }
    const voterObj = p.voters[user.account];
    const result = await this.service.votingLog.create({
      pid: id,
      uid,
      voter: user.account,
      weight: voterObj.weight,
      block_number: 0,
      trx: txHash,
      block_hash: blockHash,
    });
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async votingLog() {
    const ctx = this.ctx;
    const { pid, pageindex = 1, pagesize = 10 } = ctx.query;
    const result = await this.service.votingLog.listByPid(pid, parseInt(pageindex), parseInt(pagesize));
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
}
module.exports = NearController;
