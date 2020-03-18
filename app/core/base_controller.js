'use strict';

const { Controller } = require('egg');
const jwt = require('jwt-simple');
const moment = require('moment');
const EOS = require('eosjs');
const ecc = require('eosjs-ecc');
const _ = require('lodash');
// const ONT = require('ontology-ts-sdk');
class BaseController extends Controller {

  constructor(ctx) {
    super(ctx);
    if (!this.app.read_cache) {
      this.app.read_cache = {};
    }
    if (!this.app.value_cache) {
      this.app.value_cache = {};
    }
    if (!this.app.ups_cache) {
      this.app.ups_cache = {};
    }
    if (!this.app.post_cache) {
      this.app.post_cache = {};
    }
    this.eosClient = EOS({
      chainId: ctx.app.config.eos.chainId,
      httpEndpoint: ctx.app.config.eos.httpEndpoint,
    });

    this.clientIP = ctx.header['x-real-ip'] || ctx.ip;
  }

  get user() {
    const copy = this.ctx.user;
    const displayName = copy.nickname || copy.username;
    const emailMask = str => str.replace(
      /(?<=.)[^@\n](?=[^@\n]*?@)|(?:(?<=@.)|(?!^)\G(?=[^@\n]*$)).(?=.*\.)/gm,
      '*');
    // 如果displayName不是邮箱则不会被大马赛克
    return { ...copy, displayName: emailMask(displayName) };
  }

  success(data) {
    this.ctx.body = {
      success: true,
      data,
    };
  }

  notFound(msg) {
    msg = msg || 'not found';
    this.ctx.throw(404, msg);
  }

  response(code, msg) {
    this.ctx.status = code;
    this.ctx.body = { msg, code };
  }

  checkAuth(username) {
    this.logger.info('checkAuth..', username);
    console.log('checkAuth..', username);

    const token = this.ctx.request.header['x-access-token'];
    if (!token) {
      throw new Error('no access_token');
    }

    // 校验 token， 解密， 验证token的可用性 ，检索里面的用户
    try {
      const decoded = jwt.decode(token, this.app.config.jwtTokenSecret);

      if (decoded.exp <= Date.now()) {
        throw new Error('invaid access_token: expired');
      }

      if (username && username !== decoded.iss) {
        throw new Error('invaid access_token: wrong user');
      }

      return decoded.iss;
    } catch (err) {
      this.logger.error('access token decode err', err);
      console.log('access token decode err', err);
      throw err;
    }
  }

  get_current_user() {
    const token = this.ctx.request.header['x-access-token'];

    if (!token) {
      return null;
    }

    try {
      const decoded = jwt.decode(token, this.app.config.jwtTokenSecret);
      return decoded.iss;
    } catch (err) {
      return null;
    }
  }

  async eos_signature_verify(author, sign_data, sign, publickey) {
    try {
      const eosacc = await this.eosClient.getAccount(author);

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
        throw new Error('permission verify failuree');
      }

    } catch (err) {
      throw new Error('eos username verify failure');
    }

    try {
      const recover = ecc.recover(sign, sign_data);
      if (recover !== publickey) {
        throw new Error('invalid signature');
      }
    } catch (err) {
      throw new Error('invalid signature ' + err);
    }
  }

  async ont_signature_verify(msg, sign, publickey) {
    try {
      /*
      const pub = new ONT.Crypto.PublicKey(publickey);

      const signature = ONT.Crypto.Signature.deserializeHex(sign);

      const pass = pub.verify(msg, signature);

      if (!pass) {
        throw new Error("invalid ont signature");
      }
      */
    } catch (err) {
      throw err;
    }
  }

}
module.exports = BaseController;
