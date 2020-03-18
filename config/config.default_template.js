/* eslint valid-jsdoc: "off" */

'use strict';

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
module.exports = appInfo => {

  const config = {};

  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + '_1552273931927_1142';
  config.jwtTokenSecret = 'smart signature auth secret';

  config.env = 'test';
  // add your middleware config here
  config.middleware = [ 'errorHandler' ];

  config.errorHandler = {
    match: '/',
  },

  config.mysql = {
    // 单数据库信息配置
    client: {
      // host
      host: 'xxxxx',
      // 端口号
      port: '3306',
      // 用户名
      user: 'xxx',
      // 密码
      password: 'xxxxx',
      // 数据库名
      database: 'xxxx',
      ssl: {
        // ca: fs.readFileSync(__dirname + '/certs/ca.pem'),
        // key: fs.readFileSync(__dirname + '/certs/client-key.pem'),
        // cert: fs.readFileSync(__dirname + '/certs/client-cert.pem')
      },
    },
    // 是否加载到 app 上，默认开启
    app: true,
    // 是否加载到 agent 上，默认关闭
    agent: false,
  };

  config.eos = {
    httpEndpoint: 'http://eos.greymass.com',
    chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906',
    keyProvider: 'a private key',
    contract: 'signature.bp',
    actor: 'kuriharachie',
    startAt: 1500,
  };

  config.mail = {
    host: 'xxx',
    port: 465,
    secure: true,
    auth: {
      user: 'xxx',
      pass: 'xxx',
    },
  };

  config.security = {
    // TODO: reset in production
    domainWhiteList: [ 'localhost:8080', 'ss-web.starling.team', '.ngrok.io', '192.168.0.102:8080', 'sign-dev.dravatar.xyz', '192.168.31.67:8080' ],
    csrf: {
      enable: false,
    },
  };

  config.cors = {
    credentials: true,
  };

  return config;
};

