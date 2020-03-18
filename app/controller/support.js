'use strict';

const Controller = require('../core/base_controller');
const _ = require('lodash');
const consts = require('../service/consts');

class SupportController extends Controller {

  constructor(ctx) {
    super(ctx);
  }

  async support() {
    const { ctx } = this;
    const { signId, contract, symbol, amount, platform, referrer, comment } = this.ctx.request.body;

    // const transdata = await this.service.vnt.getTransaction(txhash);
    // const transdata2 = await this.service.vnt.getTransactionReceipt(txhash);
    // await this.service.vnt.verify({ id: 437617, uid: 1068, platform: 'vnt', txhash: '0x0efe43e209009c2ef1cd53e7495cb5392f8e8805800e880b018cdfcec1aaa97b' });
    // return;

    if (!signId) {
      return this.response(403, 'signId required');
    }
    if (!contract) {
      return this.response(403, 'contract required');
    }
    if (!symbol) {
      return this.response(403, 'symbol required');
    }
    if (!amount) {
      return this.response(403, 'amount required');
    }
    if (!platform) {
      return this.response(403, 'platform required');
    }
    if (!(platform === 'eos' || platform === 'ont' || platform === 'vnt')) {
      return this.response(403, 'platform not support');
    }

    let referreruid = parseInt(referrer);

    if (isNaN(referreruid)) {
      referreruid = 0;
    }

    if (referrer) {
      // 不能是自己
      if (referreruid === this.ctx.user.id) {
        this.ctx.body = ctx.msg.referrerNoYourself;
        return;
      }

      // 判断是否可以当推荐人
      const flag = await this.service.mechanism.payContext.canBeReferrer(referreruid, signId);
      if (!flag) {
        this.ctx.body = ctx.msg.referrerNotExist;
        return;
      }
    }

    // 保存赞赏
    const supportId = await this.service.support.create(this.ctx.user.id, signId, contract, symbol, amount, referreruid, platform);

    // 失败
    if (supportId <= 0) {
      this.ctx.body = ctx.msg.serverError;
      return;
    }

    // 处理评论内容
    if (comment && _.trim(comment).length > 0 && supportId > 0) {
      await this.service.comment.create(ctx.user.id, ctx.user.username, signId, _.trim(comment), consts.commentTypes.support, supportId);
    }

    const ret = ctx.msg.success;
    ret.data = { supportId };
    this.ctx.body = ret;
  }

  // 保存交易hash
  async saveTxhash() {
    const { ctx } = this;
    const { supportId, txhash } = this.ctx.request.body;
    const result = await this.service.support.saveTxhash(supportId, ctx.user.id, txhash);

    ctx.body = ctx.msg.success;
  }

  // 待删除，转移到comment.js
  async comments() {

    const ctx = this.ctx;

    const { pagesize = 20, page = 1, signid } = this.ctx.query;

    // singid缺少,此种情况用户正常使用时候不会出现
    if (!signid) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    const shares = await this.service.support.commentList(parseInt(signid), parseInt(page), parseInt(pagesize));

    if (shares === null) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = shares;
  }

  // 待删除，转移到order.js
  async myProducts() {

    const ctx = this.ctx;
    const userid = ctx.user.id;

    const { page = 1, pagesize = 20 } = ctx.query;

    const products = await this.service.support.getUserProducts(page, pagesize, userid);

    if (products === null) {
      ctx.body = ctx.msg.failure;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = products;
  }

}

module.exports = SupportController;
