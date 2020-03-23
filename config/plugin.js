'use strict';

/** @type Egg.EggPlugin */
module.exports = {
  mysql: {
    enable: true,
    package: 'egg-mysql',
  },
  cors: {
    enable: true,
    package: 'egg-cors',
  },
  nunjucks: {
    enable: true,
    package: 'egg-view-nunjucks',
  },

  oss: {
    enable: true,
    package: 'egg-oss',
  },

  // 增加限流控制
  ratelimiter: {
    enable: true,
    package: 'egg-ratelimiter',
  },

  redis: {
    enable: true,
    package: 'egg-redis',
  },
  //
  // alinode: {
  //   enable: true,
  //   package: 'egg-alinode',
  // },
};
