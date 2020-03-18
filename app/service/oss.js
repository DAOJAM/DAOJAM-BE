'use strict';
const Service = require('egg').Service;
const fs = require('fs');

class AliOssService extends Service {
  async uploadImage(filename, filelocation) {
    const { ctx } = this;
    let result = null;
    try {
      // 上传至OSS
      result = await ctx.oss.put(filename, filelocation);
      // 删除本地文件
      await fs.unlinkSync(filelocation);
    } catch (err) {
      this.logger.error('UserService:: uploadAvatar error: %j', err);
      return 2;
    }

    if (!result) {
      return 3;
    }

    return 0;
  }
}

module.exports = AliOssService;
