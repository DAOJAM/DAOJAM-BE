'use strict';
const jwt = require('jwt-simple');
const message = require('../config/message');
const apiAccessToken = require('../config/apiaccesstoken');

module.exports = {

  // 验证登录，未登录抛异常
  async authorize(ctx, next) {
    const lang = ctx.headers.lang;
    const token = ctx.header['x-access-token'];
    ctx.msg = message.returnObj(lang);

    // 没有authorization token信息
    if (token === undefined) {
      // ctx.throw(401, 'Access denied.');
      ctx.status = 401;
      ctx.body = ctx.msg.unauthorized;
      return;
    }

    ctx.user = {};
    ctx.user.isAuthenticated = false;

    // 校验 token， 解密， 验证token的可用性 ，检索里面的用户
    try {
      const decoded = jwt.decode(token, ctx.app.config.jwtTokenSecret);

      if (decoded.exp <= Date.now()) {
        ctx.throw(401, 'invaid access_token: expired');
      }

      ctx.user.username = decoded.iss;
      ctx.user.id = decoded.id;
      ctx.user.isAuthenticated = true;
      ctx.user.platform = decoded.platform;
    } catch (err) {
      // ctx.throw(401, 'The token is error.', err);
      ctx.status = 401;
      ctx.body = ctx.msg.unauthorized;
      return;
    }

    await next();
  },

  // 验证登录token，未登录不抛异常
  async verify(ctx, next) {
    const lang = ctx.headers.lang;
    const token = ctx.header['x-access-token'];

    ctx.user = {};
    ctx.user.isAuthenticated = false;
    ctx.msg = message.returnObj(lang);

    // 校验 token， 解密， 验证token的可用性 ，检索里面的用户
    if (token !== undefined) {
      try {
        const decoded = jwt.decode(token, ctx.app.config.jwtTokenSecret);

        if (decoded.exp > Date.now()) {
          ctx.user.username = decoded.iss;
          ctx.user.id = decoded.id;
          ctx.user.isAuthenticated = true;
          ctx.user.platform = decoded.platform;
        }
      } catch (err) {
        console.log(err);
      }
    }

    await next();
  },


  // 只用于非敏感的 API调用，access-token 不对则抛异常
  async apiVerify(ctx, next) {
    const { lang } = ctx.headers;
    ctx.msg = message.returnObj(lang);

    const token = ctx.header['x-access-token'];

    // 先这样硬编码，UUID 可以随便生成，你应该不能把这个passport用于敏感功能
    const isTokenInTheList = apiAccessToken.includes(token);

    // 没有authorization token信息就401
    if (!isTokenInTheList) {
      ctx.status = 401;
      ctx.body = ctx.msg.unauthorized;
      return;
    }

    await next();
  },

  // 只用于敏感 API调用，access-token 不对则抛异常
  async apiAuthorize(ctx, next) {
    const { lang } = ctx.headers;
    ctx.msg = message.returnObj(lang);

    const token = ctx.header['x-access-token'];

    const isTokenInTheList = apiAccessToken.includes(token);

    // token不在 accessTokens 就拒绝服务
    if (!isTokenInTheList) {
      ctx.status = 401;
      ctx.body = ctx.msg.unauthorized;
      return;
    }

    await next();
  },

};

