const generate = require('nanoid/generate');

module.exports = {
  // 生成0-9A-Za-z的随机字符串
  genCharacterNumber(length) {
    return generate('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', length);
  },
};
