'use strict';

const Controller = require('../core/base_controller');
const moment = require('moment');
const _ = require('lodash');
// const ONT = require('ontology-ts-sdk');
const md5 = require('crypto-js/md5');
const consts = require('../service/consts');

class UserController extends Controller {

  async user() {
    const ctx = this.ctx;

    const id = ctx.params.id;

    const details = await this.service.user.getUserById(id);

    if (details === null) {
      ctx.body = ctx.msg.userNotExist;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = details;
  }

  // 现有资产列表和收入明细
  async tokens() {
    const { page = 1, pagesize = 20, symbol = 'EOS' } = this.ctx.query;

    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      this.ctx.body = this.ctx.msg.paramsError;
      return;
    }

    // 1. 历史总创作收入
    const tokens = await this.app.mysql.query(
      'select id, contract, symbol, amount, platform from assets where uid = ? and symbol= ? ',
      [ this.ctx.user.id, symbol ]
    );

    const countsql = 'SELECT COUNT(*) AS count FROM assets_change_log a LEFT JOIN posts b ON a.signid = b.id ';
    const listsql = 'SELECT a.contract, a.symbol, a.amount, a.type, a.create_time, a.signid, a.trx, a.toaddress, a.memo, a.status, b.title FROM assets_change_log a LEFT JOIN posts b ON a.signid = b.id ';
    const wheresql = 'WHERE a.uid = ? AND a.symbol = ? ';
    const ordersql = 'ORDER BY a.id DESC LIMIT ? ,? ';
    const sqlcode = countsql + wheresql + ';' + listsql + wheresql + ordersql + ';';

    const queryResult = await this.app.mysql.query(
      // 'select a.contract, a.symbol, a.amount, a.type, a.create_time, a.signid, a.trx, a.toaddress, a.memo, a.status, b.title from assets_change_log a left join posts b on a.signid = b.id where a.uid = ? and a.symbol = ? order by a.create_time desc limit ? ,? ',
      sqlcode,
      [ this.ctx.user.id, symbol, this.ctx.user.id, symbol, (page - 1) * pagesize, 1 * pagesize ]
    );
    const amount = queryResult[0];
    const logs = queryResult[1];

    // 作者收入
    const totalSignIncome = await this.app.mysql.query(
      'select sum(amount) as totalSignIncome from assets_change_log where type in (?) and uid = ? and symbol = ?',
      [[ 'author_sale_income', 'author_supported_income' ], this.ctx.user.id, symbol ]
    );

    // 分享者收入
    const totalShareIncome = await this.app.mysql.query(
      'select sum(amount) as totalShareIncome from assets_change_log where type in (?) and uid = ? and symbol = ?',
      [[ 'fission_income', 'referral_income' ], this.ctx.user.id, symbol ]
    );

    // 投资/购买支出
    const totalShareExpenses = await this.app.mysql.query(
      'select sum(amount) as totalShareExpenses from assets_change_log where type in (?) and uid = ? and symbol = ?',
      [[ 'support_expenses', 'buy_expenses' ], this.ctx.user.id, symbol ]
    );

    let balance = 0;
    if (tokens && tokens.length > 0) {
      balance = tokens[0].amount;
    }

    const result = {
      balance, // 余额（待提现）
      totalSignIncome: totalSignIncome[0].totalSignIncome || 0, // 总创作收入
      totalShareIncome: totalShareIncome[0].totalShareIncome || 0, // 总打赏收入
      totalShareExpenses: totalShareExpenses[0].totalShareExpenses || 0, // 总打赏支出
      count: amount[0].count,
      logs, // 流水（之后再来处理分页）
    };

    this.ctx.body = this.ctx.msg.success;
    this.ctx.body.data = result;
  }

  // 资产列表
  async balance() {

    const tokens = await this.app.mysql.query(
      'select contract, symbol, amount, platform from assets where uid = ? ',
      [ this.ctx.user.id ]
    );

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const value = await this.app.mysql.query(
        'select sum(amount) as value from assets_change_log where uid = ? and symbol = ? and type in (?)',
        [ this.ctx.user.id, token.symbol, [ 'fission_income', 'referral_income', 'author_sale_income', 'author_supported_income' ]]
      );

      tokens[i].totalIncome = value[0].value || 0;
    }


    this.ctx.body = this.ctx.msg.success;
    this.ctx.body.data = tokens;
  }

  // 设置头像路径
  async setAvatar() {

    const ctx = this.ctx;

    const { avatar = '' } = ctx.request.body;

    const userid = ctx.user.id;

    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      // 如果ID不存在, 会以此ID创建一条新的用户数据, 不过因为jwt secret不会被知道, 所以对外不会发生
      const result = await this.app.mysql.query(
        'INSERT INTO users (id, avatar, create_time) VALUES ( ?, ?, ?) ON DUPLICATE KEY UPDATE avatar = ?',
        [ userid, avatar, now, avatar ]
      );

      const updateSuccess = result.affectedRows >= 1;

      if (updateSuccess) {
        ctx.body = ctx.msg.success;
      } else {
        ctx.body = ctx.msg.failure;
      }
    } catch (err) {
      this.logger.error('UserController:: updateAvatar Error: %j', err);
      ctx.body = ctx.msg.failure;
    }
  }

  // 上传头像文件， 返回头像地址路径
  async uploadAvatar() {
    const ctx = this.ctx;
    const file = ctx.request.files[0];
    const filetype = file.filename.split('.');

    // 文件上OSS的路径
    const filename = '/avatar/'
      + moment().format('YYYY/MM/DD/')
      + md5(file.filepath).toString()
      + '.' + filetype[filetype.length - 1];

    // // 文件在本地的缓存路径
    // const filelocation = 'uploads/' + path.basename(file.filename);

    // filepath需要再改
    const uploadStatus = await this.service.user.uploadAvatar(filename, file.filepath);

    if (uploadStatus !== 0) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
  }

  // 上传 banner 图像文件并返回地址
  async uploadBanner() {
    const ctx = this.ctx;
    const file = ctx.request.files[0];
    const filetype = file.filename.split('.');

    // 文件上OSS的路径
    const filename = '/banner/'
      + moment().format('YYYY/MM/DD/')
      + md5(file.filepath).toString()
      + '.' + filetype[filetype.length - 1];

    // filepath需要再改
    const uploadStatus = await this.service.user.uploadBannerImage(filename, file.filepath);

    if (uploadStatus !== 0) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
  }

  // 将设置用户昵称、个性签名合而为一
  async setProfile() {
    const ctx = this.ctx;
    const { nickname = null, introduction = null, accept = null } = ctx.request.body;

    const setResult = await this.service.user.setProfile(ctx.user.id, nickname, introduction, accept);
    if (setResult === true) {
      ctx.body = ctx.msg.success;
      return;
    }

    if (setResult === 4) {
      ctx.body = ctx.msg.userIntroductionInvalid;
      ctx.status = 400;
      return;
    } else if (setResult === 6) {
      ctx.body = ctx.msg.nicknameDuplicated;
      ctx.status = 400;
      return;
    } else if (setResult === 7) {
      ctx.body = ctx.msg.nicknameInvalid;
      ctx.status = 400;
      return;
    }

    ctx.body = ctx.msg.failure;
  }

  async setLinks() {
    const ctx = this.ctx;
    const { websites = [], socialAccounts = {} } = ctx.request.body;

    const result = await this.service.user.saveLinks(ctx.user.id, websites, socialAccounts);
    if (result === false) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
  }

  async getLinks() {
    const ctx = this.ctx;
    const { id } = ctx.params;

    const links = await this.service.user.getLinks(parseInt(id));

    if (links === null) {
      ctx.body = ctx.msg.userNotExist;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = links;
  }

  async getUserDetails() {
    const ctx = this.ctx;

    const details = await this.service.user.getUserDetails(ctx.user.id, ctx.user.platform);
    if (details === null) {
      ctx.body = ctx.msg.userNotExist;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = details;
  }

  isInteger(amount) {
    return typeof amount === 'number' && amount % 1 === 0;
  }

  async withdraw() {
    const ctx = this.ctx;
    const { contract, symbol, amount, platform, toaddress, memo, publickey, sign } = ctx.request.body;

    // 注意： platform是体现到的地址的平台， ctx.user.platfrom是该用户的平台
    let verifyStatus = true;
    // 验证提现地址合法性
    if (platform === 'eos') {
      verifyStatus = await this.service.user.isEosAddress(toaddress);
      if (verifyStatus === false) {
        ctx.body = ctx.msg.eosAddressInvalid;
        return;
      }
    } else if (platform === 'ont') {
      verifyStatus = await this.service.user.isOntAddress(toaddress);
      if (verifyStatus === false) {
        ctx.body = ctx.msg.ontAddressInvalid;
        return;
      }
    }

    // 签名验证
    try {
      if (ctx.user.platform === 'eos') {
        // EOS最小提现 (测试先不限制)
        // if(amount < 10000){
        //   return this.response(403, "EOS withdtaw amount must greater than 1 ");
        // }

        let sign_data = `${toaddress} ${contract} ${symbol} ${amount}`;
        if (platform === 'ont') {
          sign_data = `${toaddress.slice(0, 12)} ${toaddress.slice(12, 24)} ${toaddress.slice(24, 36)} ${contract.slice(0, 12)} ${contract.slice(12, 24)} ${contract.slice(24, 36)} ${symbol} ${amount}`;
        }
        this.logger.info('debug for withdraw', ctx.user.platform, sign_data, publickey, sign);
        console.log('debug for withdraw', ctx.user.platform, sign_data, publickey, sign);
        await this.eos_signature_verify(ctx.user.username, sign_data, sign, publickey);
      } else if (ctx.user.platform === 'ont') {

        // ONT最小提现 (测试先不限制)
        // if(amount < 30000){
        //   return this.response(403, "ONT withdtaw amount must greater than 3 ONT");
        // }
        /*
        const sign_data = `${toaddress} ${contract} ${symbol} ${amount}`;
        const msg = ONT.utils.str2hexstr(sign_data);
        await this.ont_signature_verify(msg, sign, publickey, publickey, sign);
        */
      } else if (ctx.user.platform === 'github') {
        this.logger.info('UserController:: withdraw: There is a github user withdrawing...');
      } else if (ctx.user.platform === 'email') {
        this.logger.info('UserController:: withdraw: There is a Email user withdrawing...');
      } else {
        ctx.body = ctx.msg.postPublishSignVerifyError; // 'platform not support';
        return;
      }
    } catch (err) {
      this.logger.error('signature_verify error', err);
      console.log('signature_verify error', err);
      ctx.body = ctx.msg.postPublishSignVerifyError; // err.message;
      return;
    }

    let asset = await this.app.mysql.get('assets', { uid: ctx.user.id, symbol, platform, contract });

    if (!asset) {
      return this.response(403, 'not available asset can withdtaw');
    }

    const withdraw_amount = parseInt(amount);

    if (!withdraw_amount) {
      return this.response(403, 'invalid amount');
    }

    if (withdraw_amount <= 0) {
      return this.response(403, 'invalid amount');
    }

    if (!toaddress) {
      return this.response(403, 'withdraw address required');
    }

    if (platform === 'ont') {
      const num = withdraw_amount / 10000;
      if (!this.isInteger(num)) {
        return this.response(403, 'ONT withdraw only support Integer');
      }
    }

    const transfer_memo = memo ? memo : 'Withdraw from Smart Signature';

    try {
      const conn = await this.app.mysql.beginTransaction();

      try {
        // for update 锁定table row
        const result = await conn.query('SELECT * FROM assets WHERE id=? limit 1 FOR UPDATE;', [ asset.id ]);

        asset = result[0];

        if (withdraw_amount > asset.amount) {
          throw new Error('withdraw amount should less than balance');
        }

        const remind_amount = asset.amount - withdraw_amount;

        await conn.update('assets', {
          amount: remind_amount,
        }, { where: { id: asset.id } });

        const now = moment().format('YYYY-MM-DD HH:mm:ss');
        await conn.insert('assets_change_log', {
          uid: ctx.user.id,
          contract,
          symbol,
          amount: withdraw_amount,
          platform,
          type: 'withdraw',
          toaddress,
          memo: transfer_memo,
          status: 0,
          create_time: now,
        });

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }

      ctx.body = ctx.msg.success;

    } catch (err) {
      ctx.logger.error(err.sqlMessage);
      ctx.body = ctx.msg.failure;
    }
  }

  // 普通精准搜索， 用于文章转让时候确定用户
  async search() {
    const { q = '' } = this.ctx.query;

    let user = await this.service.account.binding.get2({ nickname: q });
    // let user = await this.app.mysql.get('users', { nickname: q });
    if (!user) {
      user = await this.service.account.binding.get2({ username: q });
      // user = await this.app.mysql.get('users', { username: q });
    }

    if (!user) {
      this.ctx.body = this.ctx.msg.userNotExist;
      return;
    }

    const result = {
      id: user.id,
      avatar: user.avatar || '',
      nickname: user.nickname,
      username: this.ctx.service.user.maskEmailAddress(user.username),
    };

    this.ctx.body = this.ctx.msg.success;
    this.ctx.body.data = result;
  }

  // 推荐作者（用户）
  async recommend() {
    const ctx = this.ctx;
    const current_user = ctx.user.id;
    const { amount = 3 } = ctx.query;

    const amountNum = parseInt(amount);
    if (isNaN(amountNum)) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    const result = await this.service.user.recommendUser(amountNum, current_user);

    if (!result) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }

  // 获取我邀请的人的列表
  async invitees() {
    const ctx = this.ctx;
    const result = await this.service.user.invitees(ctx.user.id);
    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }

  // 获取任务状态
  async getPointStatus() {
    const ctx = this.ctx;

    // 获取积分领取领取状态
    const login = await this.service.mining.getTaskStatus(ctx.user.id, consts.pointTypes.login);
    const profile = await this.service.mining.getTaskStatus(ctx.user.id, consts.pointTypes.profile);
    const todayReadPoint = await this.service.mining.getTodayPoint(ctx.user.id, consts.pointTypes.read);
    const todayPublishPoint = await this.service.mining.getTodayPoint(ctx.user.id, consts.pointTypes.publish);
    const amount = await this.service.mining.balance(ctx.user.id);

    ctx.body = ctx.msg.success;
    ctx.body.data = {
      amount, login, profile,
      read: {
        today: todayReadPoint,
        max: this.config.points.readDailyMax,
      },
      publish: {
        today: todayPublishPoint,
        max: this.config.points.publishDailyMax,
      },
    };
  }

  // 获取任务积分
  async claimTaskPoint() {

    const ctx = this.ctx;
    const { type } = ctx.request.body;
    let result = 0;
    let user = null;

    switch (type) {
      case 'login':
        result = await this.service.mining.login(ctx.user.id, this.clientIP);
        break;
      case 'profile':
        user = await this.service.user.get(ctx.user.id);
        if (!user.nickname) {
          ctx.body = ctx.msg.pointNoProfile;
          return;
        }
        result = await this.service.mining.profile(ctx.user.id, this.clientIP);
        break;
    }

    if (result === 0) {
      ctx.body = ctx.msg.success;
    } else if (result === 1) {
      ctx.body = ctx.msg.pointAlreadyClaimed;
    } else {
      ctx.body = ctx.msg.failure;
    }
  }

  // 获取用户的积分和日志
  async points() {
    const ctx = this.ctx;

    const { page = 1, pagesize = 20 } = this.ctx.query;
    if (isNaN(parseInt(page)) || isNaN(parseInt(pagesize))) {
      ctx.body = ctx.msg.paramsError;
      return;
    }

    const result = await this.service.mining.points(ctx.user.id, page, pagesize);
    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }

  async getBookmarks() {
    const ctx = this.ctx;
    const { pagesize = 20, page = 1, order = 1, channel_id = 1 } = ctx.query;

    const result = await this.service.user.getBookmarks(ctx.user.id, order, parseInt(page), parseInt(pagesize), channel_id);
    if (result === false) {
      ctx.body = ctx.msg.failure;
      return;
    }

    if (result) {
      ctx.body = ctx.msg.success;
      ctx.body.data = result;
      return;
    }

    ctx.body = ctx.msg.failure;
  }

  async getBookmarkStats() {
    const ctx = this.ctx;

    const result = await this.service.user.getBookmarkStats(ctx.user.id);
    if (result === false) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = ctx.msg.success;
    ctx.body.data = result;
  }

}

module.exports = UserController;
