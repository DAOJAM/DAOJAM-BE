const Service = require('egg').Service;
const consts = require('./consts');

class sendCloudService extends Service {
  // 发送验证码服务
  async sendCaptcha(email, captcha, type = consts.mailTemplate.registered) {
    const API_USER = this.config.sendCloud.API_USER;
    const API_KEY = this.config.sendCloud.API_KEY;
    const x_smtpapi = {
      to: [ email ],
      sub: {
        '%captcha%': [ captcha ],
      },
    };
    let templateInvokeName = '';
    if (type === consts.mailTemplate.registered) {
      templateInvokeName = 'daojam_sign_up';
    } else if (type === consts.mailTemplate.resetPassword) {
      templateInvokeName = 'daojam_reset_password';
    }
    const params = {
      apiUser: API_USER,
      apiKey: API_KEY,
      from: 'admin@matataki.io',
      to: email,
      templateInvokeName,
      fromName: 'DAOJam 团队',
      xsmtpapi: JSON.stringify(x_smtpapi),
    };
    const querystringParams = require('querystring').stringify(params);
    let result = null;
    try {
      const responseStr = await this.ctx.curl(`http://api.sendcloud.net/apiv2/mail/sendtemplate?${querystringParams}`, {
        method: 'POST',
      });
      if (responseStr.status === 200) {
        result = responseStr;
      } else {
        this.logger.error('sendCloudService:: sendCaptcha error: %j', responseStr);
      }
    } catch (err) {
      this.logger.error('sendCloudService:: sendCaptcha error: %j', err);
      return null;
    }
    return result;
  }
}

module.exports = sendCloudService;
