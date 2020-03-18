'use strict';
const OSS = require('ali-oss');
const Controller = require('egg').Controller;

class HomeController extends Controller {
  async index() {
    this.ctx.body = 'hi, egg, version=1.6.8, ' + this.ctx.header['x-real-ip'];
  }

  async test() {
    // await this.service.mechanism.payContext.test();
    // return;

    // const result = await this.ctx.oss.put('/abc/a.txt', new Buffer('aaaaaaa'));

    const store = OSS({
      accessKeyId: 'LTAIMVZZXndfwVfL',
      accessKeySecret: 'gcMFczt2V3wLrHl93SDgmSsulsxfM8',
      bucket: 'smartsignature-file',
      region: 'oss-cn-hongkong.aliyuncs.com',
    });


    const url = store.signatureUrl('car.jpg', { expires: 3600 });
    console.log(url);

    const STS = OSS.STS;
    const sts = new STS({
      accessKeyId: 'LTAIMVZZXndfwVfL',
      accessKeySecret: 'gcMFczt2V3wLrHl93SDgmSsulsxfM8',
    });

    const policy = {
      Statement: [
        {
          Action: [
            'oss:Get*',
          ],
          Effect: 'Allow',
          Resource: [ 'acs:oss:*:*:smartsignature-img/*' ],
        },
      ],
      Version: '1',
    };
    const token = await sts.assumeRole('acs:ram::1507942207724983:role/ssfile-readony', null, 15 * 60, 'getfile');
    this.ctx.body = 'hi, egg, version=1.6.8, ' + this.ctx.header['x-real-ip'] + ' token=' + token + ' url=' + url;
  }
}

module.exports = HomeController;
