'use strict';

const Service = require('egg').Service;
const md5 = require('crypto-js/md5');
const sha256 = require('crypto-js/sha256');
const axios = require('axios');
const moment = require('moment');
const jwt = require('jwt-simple');
const consts = require('./consts');
const ecc = require('eosjs-ecc');
const ONT = require('ontology-ts-sdk');
const EOS = require('eosjs');
const OAuth = require('oauth');
const { createHash, createHmac } = require('crypto');

class AuthService extends Service {

  constructor(ctx, app) {
    super(ctx, app);
    this.app.mysql.queryFromat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };
    this.eosClient = EOS({
      chainId: ctx.app.config.eos.chainId,
      httpEndpoint: ctx.app.config.eos.httpEndpoint,
    });
  }

  async eos_auth(sign, username, publickey) {
    // 2. 验证签名
    try {
      const recover = ecc.recover(sign, username);
      if (recover !== publickey) {
        return false;
      }
    } catch (err) {
      return false;
    }

    // 由于EOS的帐号系统是 username 和 公钥绑定的关系，所有要多加一个验证，username是否绑定了签名的EOS公钥
    try {
      const eosacc = await this.eosClient.getAccount(username);
      let pass_permission_verify = false;

      for (let i = 0; i < eosacc.permissions.length; i++) {
        const permit = eosacc.permissions[i];
        const keys = permit.required_auth.keys;
        for (let j = 0; j < keys.length; j++) {
          const pub = keys[j].key;
          if (publickey === pub) {
            pass_permission_verify = true;
          }
        }
      }

      if (!pass_permission_verify) {
        return false;
      }
    } catch (err) {
      // this.logger.error('AuthController.eos_auth error: %j', err);
      return false;
    }

    return true;
  }

  async ont_auth(sign, username, publickey) {

    const pub = new ONT.Crypto.PublicKey(publickey);

    const msg = ONT.utils.str2hexstr(username);

    const signature = ONT.Crypto.Signature.deserializeHex(sign);

    const pass = pub.verify(msg, signature);

    return pass;

  }

  telegram_auth(token, { hash, ...data }) {
    const secret = createHash('sha256')
      .update(token)
      .digest();
    const checkString = Object.keys(data)
      .sort()
      .map(k => `${k}=${data[k]}`)
      .join('\n');
    const hmac = createHmac('sha256', secret)
      .update(checkString)
      .digest('hex');
    this.logger.info('controller:telegram_auth::', { hash, hmac });
    return hmac === hash;
  }

  // twitter号验证，获取oauth_token_secret
  // 详情见https://developer.twitter.com/en/docs/basics/authentication/guides/log-in-with-twitter
  async twitter_auth(oauth_token, oauth_verifier) {
    function randomString(len) {
      len = len || 32;
      const $chars = 'abcdefhijkmnprstwxyz2345678';
      const maxPos = $chars.length;
      let pwd = '';
      for (let i = 0; i < len; i++) {
        pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
      }
      return pwd;
    }
    const timestamp = parseInt(Date.parse(new Date())) / 1000;
    const ranstr = randomString(12);
    const httpmethod = 'GET';
    let twitterurl = 'http://api.twitter.com/oauth/access_token';
    const params = 'oauth_consumer_key=' + this.app.config.twitter.appkey
    + '&oauth_nonce=' + ranstr
    + '&oauth_signature_method=' + 'HMAC-SHA1'
    + '&oauth_timestamp=' + timestamp
    + '&oauth_token=' + oauth_token
    + '&oauth_verifier=' + oauth_verifier
    + '&oauth_version=' + '1.0';
    const signtext = httpmethod + '&' + encodeURIComponent(twitterurl) + '&' + encodeURIComponent(params);
    const signkey = encodeURIComponent(this.app.config.twitter.appkey) + '&' + encodeURIComponent(this.app.config.twitter.appsecret);
    const sign = encodeURIComponent(createHmac('sha1', signkey).update(signtext).digest()
      .toString('base64'));
    twitterurl = 'https://api.twitter.com/oauth/access_token';
    const requesturl = twitterurl + '?' + params
    + '&oauth_signature=' + sign;
    const data = (await axios({
      method: 'get',
      url: requesturl,
    })).data;
    const token = {};
    const dataarr = data.split('&');
    for (const index in dataarr) {
      token[dataarr[index].split('=')[0]] = dataarr[index].split('=')[1];
    }
    return token;
  }

  // twitter号登录，验证token和secret
  // 方法见https://webapplog.com/node-js-oauth1-0-and-oauth2-0-twitter-api-v1-1-examples/
  async twitter_login(oauth_token, oauth_token_secret) {
    let tokendata = null;
    try {
      const oauth = new OAuth.OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        this.app.config.twitter.appkey,
        this.app.config.twitter.appsecret,
        '1.0A',
        null,
        'HMAC-SHA1'
      );
      const userdata = await new Promise((resolve, reject) => oauth.get(
        'https://api.twitter.com/1.1/account/verify_credentials.json?id=23424977',
        oauth_token,
        oauth_token_secret,
        function(e, data, res) {
          if (e) {
            reject(e);
          }
          resolve(JSON.parse(data));
        })
      );
      tokendata = userdata;
    } catch (err) {
      this.logger.error('AuthService:: verifyCode failed: err: %j', err);
      return null;
    }
    return tokendata;
  }

  // github账号登录，验证access_token, 暂时是不verify state的
  async verifyCode(code) {
    let tokendata = null;
    try {
      const token = await axios({
        method: 'POST',
        url: 'https://github.com/login/oauth/access_token',
        headers: {
          accept: 'application/json',
          'User-Agent': this.ctx.app.config.github.appName,
        },
        data: {
          client_id: this.ctx.app.config.github.clientId,
          client_secret: this.ctx.app.config.github.clientSecret,
          code,
        },
      });
      tokendata = token.data;
    } catch (err) {
      this.logger.error('AuthService:: verifyCode failed: err: %j', err);
      return null;
    }
    if (tokendata.access_token === undefined) {
      return null;
    }
    return tokendata;
  }

  // 获取github用户信息
  async getGithubUser(usertoken) {

    let userinfo = null;
    try {
      userinfo = await axios({
        method: 'GET',
        url: 'https://api.github.com/user',
        headers: {
          Authorization: 'token ' + usertoken,
          'User-Agent': this.ctx.app.config.github.appName,
          accept: 'application/json',
        },
      });

    } catch (err) {
      this.logger.error('AuthService:: getUserinfo failed: %j', err);
      return null;
    }
    return userinfo.data;
  }

  // github账号登录，创建或登录用户, 发放jwt token
  // todo：2019-8-27 缺少登录日志
  async saveUser(username, nickname, avatarUrl, ip = '', referral = 0, platform = 'github') {
    try {
      // let currentUser = await this.app.mysql.get('users', { username, platform });
      let currentUser = await this.service.account.binding.get2({ username, platform });
      // 用户是第一次登录, 先创建
      if (currentUser === null) {
        // await this.app.mysql.insert('users', {
        //   username,
        //   platform,
        //   create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        // });

        await this.insertUser(username, '', platform, 'ss', ip, '', referral);

        // 若没有昵称, 先把username给nickname
        if (nickname === null) {
          nickname = username;
        }

        // 判断昵称是否重复, 重复就加前缀
        const duplicatedNickname = await this.service.account.binding.get2({ nickname });
        // const duplicatedNickname = await this.app.mysql.get('users', { nickname });

        if (duplicatedNickname !== null) {
          nickname = `${platform}_${nickname}`;
        }

        const avatar = await this.service.user.uploadAvatarFromUrl(avatarUrl);

        // 更新昵称
        await this.app.mysql.update('users',
          { nickname, avatar },
          { where: { username, platform } }
        );

        currentUser = await this.service.account.binding.get2({ username, platform });
        if (platform === 'telegram') { // update telegramUid
          await this.service.tokenCircle.api.updateUser(
            currentUser.id, { telegramUid: username }
          );
        }
        // currentUser = await this.app.mysql.get('users', { username, platform });
      }

      // await this.service.search.importUser(currentUser.id);

      // 增加登录日志
      await this.insertLoginLog(currentUser.id, ip);

      // const expires = moment().add(7, 'days').valueOf();

      const jwttoken = this.jwtSign(currentUser);
      // jwt.encode({
      //   iss: currentUser.username,
      //   exp: expires,
      //   platform,
      //   id: currentUser.id,
      // }, this.app.config.jwtTokenSecret);

      return jwttoken;

    } catch (err) {
      this.logger.error('AuthService:: getUserinfo failed: %j', err);
      return null;
    }
  }

  // twitter账号登录，创建或登录用户, 发放jwt token
  async saveTwitterUser(username, nickname, avatarUrl, ip = '', referral = 0, platform = 'twitter') {
    // 注释方面直接参考上面的saveUser
    try {
      let currentUser = await this.service.account.binding.get2({ username, platform });
      if (currentUser === null) {
        await this.insertUser(username, '', platform, 'ss', ip, '', referral);
        if (nickname === null) {
          nickname = username;
        }
        const duplicatedNickname = await this.service.account.binding.get2({ nickname });
        if (duplicatedNickname !== null) {
          nickname = `${platform}_${nickname}`;
        }
        const avatar = await this.service.user.uploadAvatarFromUrl(avatarUrl);
        await this.app.mysql.update('users',
          { nickname, avatar },
          { where: { username, platform } }
        );
        currentUser = await this.service.account.binding.get2({ username, platform });
      }
      await this.insertLoginLog(currentUser.id, ip);
      const jwttoken = this.jwtSign(currentUser);
      return jwttoken;
    } catch (err) {
      this.logger.error('AuthService:: getUserinfo failed: %j', err);
      return null;
    }
  }

  // 验证用户账号是否存在， todo，添加platform信息
  async verifyUser(username) {
    /* const user = await this.app.mysql.query(
      'SELECT id FROM users WHERE username = :username;',
      { username }
    ); */
    const user = await this.service.account.binding.get2({ username, platform: 'email' });
    return !!user;
    /* const userBinding = await this.app.mysql.get('user_accounts', { account: username, platform: 'email' });
    return user.length > 0 || userBinding !== null; */
  }

  async sendRegisteredCaptchaMail(email) {
    return this.sendCaptchaMail(email);
  }

  async sendResetpasswordCaptchaMail(email) {
    return this.sendCaptchaMail(email, consts.mailTemplate.resetPassword);
  }

  // 发送邮箱验证码
  async sendCaptchaMail(email, type = consts.mailTemplate.registered) {

    const mailhash = `captcha:${type}:${md5(email).toString()}`;
    const timestamp = Date.now();
    // 是否在1分钟之内获取过验证码， 无论是否消耗
    const lastSentQuery = await this.app.redis.get(mailhash);
    if (lastSentQuery) {
      const lastSentInfo = JSON.parse(lastSentQuery);
      // 上个验证码的生成时间不到60000ms
      if (timestamp - lastSentInfo.timestamp < 60000) {
        this.logger.info('AuthService:: sendCaptchaMail: Captcha rate limit for Email', email);
        return 1;
      }
    }

    // 为了生成验证码（CAPTCHA）
    const randomString = timestamp + email + 'salt';
    const md5raw = md5(randomString).words[0];
    const md5str = Math.abs(md5raw).toString();

    let captcha;
    if (md5str.length < 6) {
      captcha = '0'.repeat(6 - md5str.length) + md5str;
    } else {
      captcha = md5str.substring(md5str.length - 6, md5str.length);
    }

    // 生成需要存放的数据： 验证码， 时间戳， 状态
    const storeItems = { captcha, timestamp, status: 3 };
    const storeString = JSON.stringify(storeItems);
    await this.app.redis.set(mailhash, storeString, 'EX', 300);
    this.logger.info('AuthService:: sendCaptchaMail: Captcha generated: ', email);
    // await this.app.redis.hmset(mailhash, storeItems);

    // const captchaStatus = await this.app.redis.get(mailhash);
    // console.log(captchaStatus);

    const sendCloudResult = await this.service.sendCloud.sendCaptcha(email, captcha, type);
    this.ctx.logger.info('sendCloudResult', sendCloudResult);
    if (sendCloudResult) {
      return 0;
    }
    const sendResult = await this.service.mail.sendCaptcha(email, captcha, type);
    if (sendResult) {
      return 0;
    }
    return 2;
  }

  // 重置密码
  async resetPassword(email, captcha, password) {
    const mailhash = `captcha:${consts.mailTemplate.resetPassword}:${md5(email).toString()}`;
    const captchaQuery = await this.app.redis.get(mailhash);
    // 从未获取过验证码
    if (!captchaQuery) {
      this.logger.info('AuthService:: resetPassword: Captcha haven\'t been generated for email ', email);
      return 1;
    }
    const captchaInfo = JSON.parse(captchaQuery);
    // 验证码不对， 减少有效次数
    if (captchaInfo.captcha !== captcha) {
      captchaInfo.status -= 1;
      this.logger.info('AuthService:: resetPassword: Captcha is wrong for email ', email);
      // 已经错误3次， 验证码失效
      if (captchaInfo.status === 0) {
        this.logger.info('AuthService:: resetPassword: Captcha expired');
        await this.app.redis.del(mailhash);
        return 2;
      }
      const storeString = JSON.stringify(captchaInfo);
      // 获取剩余TTL
      const remainTime = await this.app.redis.call('TTL', mailhash);
      // 更新剩余次数， 并维持TTL
      await this.app.redis.set(mailhash, storeString, 'EX', remainTime);
      return 3;
    }
    const passwordHash = sha256(password).toString();
    const result = await this.updatePassword(passwordHash, email);
    if (!result) {
      return 5;
    }
    this.logger.info('AuthService:: resetPassword: email ', email);
    return 0;
  }

  // 邮箱注册
  async doReg(email, captcha, password, ipaddress, referral) {
    const mailhash = `captcha:${consts.mailTemplate.registered}:${md5(email).toString()}`;
    const captchaQuery = await this.app.redis.get(mailhash);
    // 从未获取过验证码
    if (!captchaQuery) {
      this.logger.info('AuthService:: doReg: Captcha haven\'t been generated for email ', email);
      return 1;
    }
    const captchaInfo = JSON.parse(captchaQuery);
    // // 验证码已经失效， 输入次数过多
    // if (captchaInfo.status === 0) {
    //   return 2;
    // }
    // 验证码不对， 减少有效次数
    if (captchaInfo.captcha !== captcha) {
      captchaInfo.status -= 1;
      this.logger.info('AuthService:: doReg: Captcha is wrong for email ', email);
      // 已经错误3次， 验证码失效
      if (captchaInfo.status === 0) {
        this.logger.info('AuthService:: doReg: Captcha expired');
        await this.app.redis.del(mailhash);
        return 2;
      }
      const storeString = JSON.stringify(captchaInfo);
      // 获取剩余TTL
      const remainTime = await this.app.redis.call('TTL', mailhash);
      // 更新剩余次数， 并维持TTL
      await this.app.redis.set(mailhash, storeString, 'EX', remainTime);
      return 3;
    }

    // 增加用户
    // const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const passwordHash = sha256(password).toString();
    const result = await this.insertUser(email, email, consts.platforms.email, 'ss', ipaddress, passwordHash, referral);
    // const createAccount = await this.app.mysql.query(
    //   'INSERT INTO users (username, email, create_time, last_login_time, platform, source, reg_ip, password_hash) '
    //   + 'VALUES (:username, :email, :now, :now, \'email\', \'ss\', :ipaddress, :password);',
    //   { username: email, email, ipaddress, password: passwordHash, now }
    // );

    // if (createAccount.affectedRows !== 1) {
    //   return 5;
    // }
    if (!result) {
      return 5;
    }

    // const currentUser = await this.app.mysql.get('users', { username: email, platform: 'email' });
    // await this.service.search.importUser(currentUser.id);

    this.logger.info('AuthService:: doReg: New user Added for email ', email);
    return 0;
  }

  // 邮箱账号密码登录
  async verifyLogin(username, password, ipaddress) {
    // 提取用户信息
    // let userPw;
    const platform = 'email';
    /* try {
      userPw = await this.app.mysql.query(
        'SELECT id, username, password_hash,platform FROM users WHERE username = :username AND platform = :platform;',
        { username, platform }
      );
    } catch (err) {
      this.logger.error('AuthService:: verifyLogin: Error ', err);
      return 3;
    } */

    // if (userPw.length === 0) {
    // const userPw = await this.service.account.binding.getSyncFieldWithUser(username, platform);
    const userPw = await this.service.account.binding.get2({ username, platform });
    this.logger.info('AuthService:: verifyLogin: userPw ', userPw);

    if (!userPw) {
      this.logger.info('AuthService:: verifyLogin: User doesn\'t exist ', username);
      return 1;
    }
    // 密码对不上
    const passwordHash = sha256(password).toString();
    if (userPw.password_hash !== passwordHash) {
      this.logger.info('AuthService:: verifyLogin: Wrong password ', username);
      return 2;
    }

    // 增加登录日志
    await this.insertLoginLog(userPw.id, ipaddress);
    // const now = moment().format('YYYY-MM-DD HH:mm:ss');
    // let addLoginLog;
    // try {
    //   addLoginLog = await this.app.mysql.query(
    //     'INSERT INTO users_login_log (uid, ip, source, login_time) VALUES '
    //     + '(:uid, :ipaddress, \'ss\', :now);',
    //     { uid: userPw[0].id, ipaddress, now }
    //   );
    // } catch (err) {
    //   this.logger.error('AuthService:: verifyLogin: Error ', err);
    //   return 3;
    // }
    // if (addLoginLog.affectedRows !== 1) {
    //   return 3;
    // }

    // 生成token
    // const expires = moment().add(7, 'days').valueOf();
    // const jwttoken = jwt.encode({
    //   iss: userPw[0].username,
    //   exp: expires,
    //   platform: 'email',
    //   id: userPw[0].id,
    // }, this.app.config.jwtTokenSecret);
    // this.logger.info('AuthService:: verifyLogin: User Login... ', username);

    return this.jwtSign(userPw);
  }

  // 插入用户
  async insertUser(username, email, platform, source, ip, pwd, referral) {
    // 确认推荐人是否存在
    let referral_uid = parseInt(referral);
    if (referral_uid > 0) {
      const referral_user = await this.service.user.get(referral_uid);
      if (!referral_user) {
        referral_uid = 0;
      }
    }
    const now = moment().format('YYYY-MM-DD HH:mm:ss');

    const tran = await this.app.mysql.beginTransaction();
    let createAccount = null;
    try {
      createAccount = await tran.query(
        'INSERT INTO users (username, email, create_time, platform, source, reg_ip, password_hash,referral_uid) '
        + 'VALUES (:username, :email, :now, :platform, :source, :ip, :password, :referral);',
        { username, email, ip, platform, source, password: pwd, now, referral: referral_uid }
      );
      this.logger.info('service:: Auth: createAccount:', createAccount);
      const account = await this.service.account.binding.create({ uid: createAccount.insertId, account: username, password_hash: pwd, platform, is_main: 1 }, tran);
      if (!account) await tran.rollback();
      else await tran.commit();
    } catch (err) {
      await tran.rollback();
      this.logger.error('AuthService:: insertUser: Error. %j', err);
      return false;
    }

    if (createAccount.affectedRows === 1) {
      // 处理注册推荐积分
      if (referral_uid > 0) {
        await this.service.mining.register(createAccount.insertId, referral, ip);

        // 处理推荐人任务，防刷	你成功邀请的好友阅读并评价了5篇文章，你可得到xx积分
        const rediskey = `invite:read:${createAccount.insertId}`;
        await this.app.redis.lpush(rediskey, [ 1, 2, 3, 4, 5 ]);
        this.app.redis.expire(rediskey, 30 * 24 * 3600); // 30天过期
      }

      // 检测用户有没有托管的以太坊私钥，没有就生成
      const wallet = await this.service.account.hosting.create(createAccount.insertId);

      await this.service.tokenCircle.api.addUserProfile(
        createAccount.insertId, username, wallet
      );

      // 插入ES
      await this.service.search.importUser(createAccount.insertId);

      return true;
    }
    return false;
  }

  async updatePassword(passwordHash, email) {
    const tran = await this.app.mysql.beginTransaction();
    try {
      await tran.query(
        'UPDATE users SET password_hash = :passwordHash WHERE username = :email AND platform = \'email\';'
        + 'UPDATE user_accounts SET password_hash = :passwordHash WHERE account = :email AND platform = \'email\'', {
          passwordHash,
          email,
        });
      await tran.commit();
      return true;
    } catch (err) {
      await tran.rollback();
      this.logger.error('AuthService:: updatePassword: Error ', err);
      return false;
    }
  }

  // 插入登录日志
  async insertLoginLog(uid, ip) {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    try {
      await this.app.mysql.query(
        `UPDATE users SET last_login_time=:now, last_login_ip=:ip WHERE id=:uid; 
         INSERT INTO users_login_log (uid, ip, source, login_time) VALUES (:uid, :ip, \'ss\', :now);`,
        { uid, ip, now }
      );

      return true;
    } catch (err) {
      this.logger.error('AuthService:: verifyLogin: Error ', err);
      return false;
    }
  }

  // jwt token
  jwtSign(user) {
    const expires = moment().add(7, 'days').valueOf();
    const jwttoken = jwt.encode({
      iss: user.username,
      exp: expires,
      platform: user.platform,
      id: user.id,
    }, this.app.config.jwtTokenSecret);

    return jwttoken;
  }

  async getUser(username, platform) {
    return await this.service.account.binding.get2({ username, platform });
    // return await this.app.mysql.get('users', { username, platform });
  }

}

module.exports = AuthService;
