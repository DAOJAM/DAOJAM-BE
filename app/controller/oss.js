'use strict';

const Controller = require('../core/base_controller');
const moment = require('moment');
const md5 = require('crypto-js/md5');
const fileFolder = {
  avatar: 'avatar', // 头像
  userBanner: 'userBanner', // 用户封面
  articleCover: 'articleCover', // 文章封面
  article: 'article', // 编辑器上传
  temp: 'temp', // 临时文件
  coin: 'coin', // fan票
};

class AliOssController extends Controller {

  async uploadImage() {
    const { ctx } = this;
    const { folder } = ctx.query;
    console.log(ctx.request.files);
    const file = ctx.request.files[0];
    console.log(file);
    const filetype = file.filename.split('.');
    // 没有上传到指定文件夹
    if (!fileFolder[folder]) {
      ctx.body = ctx.msg.failure;
      return;
    }

    // 文件上OSS的路径
    const filename = `/${fileFolder[folder]}/`
      + moment().format('YYYY/MM/DD/')
      + md5(file.filepath).toString()
      + '.' + filetype[filetype.length - 1];

    // filepath需要再改
    const uploadStatus = await this.service.oss.uploadImage(filename, file.filepath);

    if (uploadStatus !== 0) {
      ctx.body = ctx.msg.failure;
      return;
    }

    ctx.body = {
      ...ctx.msg.success,
      data: filename,
    };
  }

}

module.exports = AliOssController;
