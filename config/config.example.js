'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
module.exports = appInfo => {

  const config = {};

  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + '_1552273931927_1142';

  // Jwt Token Secret
  config.jwtTokenSecret = '';

  config.env = 'prod';

  // add your middleware config here
  config.middleware = [ 'errorHandler' ];

  config.errorHandler = {
    match: '/',
  };

  config.mysql = {
    client: {
      host: '',
      port: '3306',
      user: '',
      password: '',
      database: '',
      ssl: {},
      multipleStatements: true,
      charset: 'utf8mb4',
    },
    // 是否加载到 app 上，默认开启
    app: true,
    // 是否加载到 agent 上，默认关闭
    agent: false,
  };

  // EOS Config
  config.eos = {
    httpEndpoint: '',
    chainId: '',
    keyProvider: '',
    contract: '',
    actor: '',
    startAt: 0,
  };

  config.security = {
    domainWhiteList: [],
    csrf: {
      enable: false,
    },
  };

  config.cors = {
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS',
    credentials: true,
  };

  // auth
  config.oAuth2Server = {
    debug: config.env === 'local',
    grants: [],
  };

  // ONT Config
  config.ont = {
    httpEndpoint: '',
    scriptHash: '',
    websocketClient: '',
    withdraw_account: '',
    withdraw_pri: '',
  };

  // Mail Config
  config.mailSetting = true;
  config.mail = {
    host: '',
    port: 465,
    secure: true,
    auth: {
      user: '',
      pass: '',
    },
  };

  config.ipfs_service = {
    host: '',
    port: 5001,
    protocol: 'https',
  };

  config.isDebug = true;

  // 获取客户端真实IP
  config.proxy = true;

  // 限流
  config.ratelimiter = {
    // db: {}, // 如已配置egg-redis 可删除此配置
    router: [
      {
        path: '/order', // 限制路由路径 此规则不会匹配(index.html?id=1)[http://url/index.html?id=1]
        max: 300,
        time: '10s', // 时间单位 s m h d y ...
        message: 'Custom request overrun error message', // 自定义请求超限错误信息
      },
      {
        path: '/post/publish', // 限制路由路径 此规则不会匹配(index.html?id=1)[http://url/index.html?id=1]
        max: 30000000,
        time: '1m', // 时间单位 s m h d y ...
        message: 'Custom request overrun error message', // 自定义请求超限错误信息
      },
    ],
  };

  // 限流如果不在db中初始化redis，则需要启用egg-redis
  config.redis = {
    client: {
      port: 6379,
      host: '',
      password: '',
      db: 1,
    },
  };

  // Mulitpart
  config.multipart = {
    mode: 'file',
    tmpdir: './uploads',
  };

  // OSS Config
  config.oss = {
    client: {
      accessKeyId: '',
      accessKeySecret: '',
      bucket: '',
      endpoint: '',
      timeout: '60s',
    },
  };

  // WX Config
  config.wx = {
    appId: '',
    appSecret: '',
  };

  config.bodyParser = {
    jsonLimit: '1mb',
    formLimit: '1mb',
  };

  // Elasticsearch Config
  config.elasticsearch = {
    host: '',
    indexPosts: '',
    indexUsers: '',
  };

  config.points = {
    regInviter: 66, // 每成功邀请一名好友注册，邀请者可得到xx积分
    regInvitee: 500, // 成功被邀请注册，登录即可领取xx积分
    regInviteFinished: 600, // 邀请任务完成奖励600积分

    loginNew: 300, // 所有新用户在活动期间首次登录即可领取x积分奖励
    loginOld: 1000, // 所有老用户在活动期间首次登录即可领取x积分奖励

    profile: 50, // 完善资料获取积分

    readRate: 15, // 15 = 30 / 2，阅读多少秒可以获得1积分，每30秒获得2积分
    readNew: 5, // 阅读新文章
    readNewAuthor: 1, // 阅读新文章，作者
    readAuthorRate: 0.5, // 阅读，作者获得阅读积分的1/2
    readReferralRate: 0.25, // 你邀请的好友通过阅读获得积分奖励，你额外可得1/4
    readDailyMax: 100, // 每日阅读最大积分
    readOnceMax: 10, // 阅读每篇文章可获得的最大积分

    publish: 100, // 发布文章
    publishReferral: 20, // 你邀请的好友发布新文章，你额外可得10积分
    publishDailyMax: 300, // 每日发文最大积分
  };

  // GeeTest Config
  config.geetest = {
    geetest_id: '',
    geetest_key: '',
  };

  // SendCloud Config
  config.sendCloud = {
    API_USER: '',
    API_KEY: '',
  };

  // WeChat Config
  config.wechat = {
    appId: '',
    appSecret: '',
  };

  config.serverChan = '';

  config.user = {
    virtualUserPrefix: 'exchange_',
  };

  config.token = {
    maintokens: [ 'BTC', 'ETH', 'XRP', 'BCH', 'USDT', 'LTC', 'EOS', 'BNB', 'BSV', 'TRX', 'XLM', 'ADA', 'XMR', 'BRC', 'DASH', 'ATOM', 'ETC', 'ONT', 'NEO', 'QTUM', 'NAS', 'STEEM' ],
  };

  config.ethereum = {
    voting: {
      privateKey: '',
    },
    runningNetwork: 'rinkeby', // mainnet or rinkeby
    infura: {
      id: '',
      secret: '',
    },
    // privateKey 还没决定好，我先用于开发工作
    privateKey: '',
    airdrop: {
      api: '',
      token: '',
      privateKey: '',
    },
  };

  // 因为只有我们来操作加解密，所以我们只需要**对称性加密**，只需要私钥
  config.crypto = {
    // 32bytes -> 256 bit, 我们是 AES-256，没毛病
    // 都是十六进制，需要 Buffer.from 指定 encoding 为 hex
    secretKey: '',
  };

  config.awsIpfs = {
    username: '',
    password: '',
  };

  // Disabled for now as DAOJam don't need telegram bot
  // config.tokenCircleBackend = {
  //   baseURL: '',
  //   bearerToken: '',
  // };

  // ali
  config.alinode = {
    appid: '',
    secret: '',
  };

  return config;
};

