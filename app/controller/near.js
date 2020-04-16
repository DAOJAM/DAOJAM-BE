const Controller = require('../core/base_controller');
const moment = require('moment');

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
  async createProposal() {
    const ctx = this.ctx;
    const {
      id,
      txHash,
      blockHash,
      introduction,
      logo,
      cover,
      repo,
      websites,
      socials,
    } = ctx.request.body;
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
      introduction,
      logo,
      cover,
      repo,
      block_number: 0,
      trx: txHash,
      block_hash: blockHash,
      owner: creator,
    });
    await ctx.service.token.mineToken.saveResources(ctx.user.id, result.insertId, websites, socials);
    ctx.body = {
      ...ctx.msg.success,
      data: result.insertId,
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
        message: 'not bind near account',
      };
      return;
    }
    const p = await this.service.nearprotocol.getProposal(id);
    if (!p) {
      ctx.body = {
        ...ctx.msg.failure,
        message: 'not sync on near',
      };
      return;
    }
    if (!p.voters[user.account]) {
      ctx.body = {
        ...ctx.msg.failure,
        message: 'not vote',
      };
      return;
    }
    // 查看数据同步的block_number
    const sqlResult = await this.app.mysql.select('daojam_vote_log', {
      where: {
        pid: id, uid,
      },
      columns: [ 'block_number' ],
    });
    // block_number数组结构
    const blockNumberArrInDB = [];
    for (const item of sqlResult) {
      blockNumberArrInDB.push(item.block_number);
    }
    ctx.logger.info('blockNumberArrInDB: ', blockNumberArrInDB);
    // near上的数据block_number
    const voterArr = p.voters[user.account].vote_infos;
    const voterObj = this.getVoteInfoObj(voterArr);
    const blockNumberArrInNear = Object.keys(voterObj);
    ctx.logger.info('blockNumberArrInNear: ', blockNumberArrInNear);
    // 计算数据库和链上数据的差集
    const diffSet = blockNumberArrInNear.filter(v => {
      return blockNumberArrInDB.indexOf(parseInt(v)) === -1;
    });
    if (diffSet.length <= 0) {
      ctx.body = {
        ...ctx.msg.failure,
        message: 'data error',
      };
      return;
    }
    const bi = diffSet[0];
    const result = await this.service.votingLog.create({
      pid: id,
      uid,
      voter: user.account,
      weight: voterObj[bi].weight,
      block_number: voterObj[bi].block_index,
      trx: txHash,
      block_hash: blockHash,
    });

    /* const existence = await this.app.mysql.get('daojam_vote_log', { pid: id, uid });
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
    }); */
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
  async setCreateCost() {
    const ctx = this.ctx;
    // const { cost } = ctx.request.body;
    // const uid = ctx.user.id;
    // await this.service.nearprotocol.setCreateCost(parseInt(cost));
    const blockNumberArrInDB = await this.app.mysql.query('SELECT uid from daojam_mint_log');
    /* const blockNumberArrInDB = await this.app.mysql.select('daojam_mint_log', {
      columns: [ 'uid' ],
    }); */
    ctx.body = blockNumberArrInDB;
  }
  getVoteInfoObj(arr) {
    const result = {};
    for (const item of arr) {
      result[item.block_index] = item;
    }
    return result;
  }
}
module.exports = NearController;
