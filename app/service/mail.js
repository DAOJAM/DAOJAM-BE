'use strict';
const Service = require('egg').Service;
const nodemailer = require('nodemailer');
const consts = require('./consts');

class MailService extends Service {

  constructor(ctx, app) {
    super(ctx, app);
    this.app.mysql.queryFromat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };
  }

  // 发送收货邮件
  async sendMail(orderid) {

    if (!orderid) {
      return null;
    }

    const product = await this.app.mysql.query(
      'SELECT u.username, u.email, o.num, o.amount, o.symbol, o.create_time FROM orders o INNER JOIN users u ON o.uid = u.id WHERE o.id = :orderid;'
      + 'SELECT s.digital_copy, p.title FROM product_stock_keys s INNER JOIN orders o ON o.id = s.order_id AND o.id = :orderid '
      + 'INNER JOIN product_prices p ON s.sign_id = p.sign_id AND p.platform = o.platform;'
      + 'SELECT p.category_id FROM posts p INNER JOIN orders o ON p.id = o.signid WHERE o.id = :orderid;',
      { orderid }
    );

    const user = product[0];
    let stock = product[1];
    const category = product[2];
    if (stock.length === 0 || category.length === 0) {
      this.logger.info('MailService:: sendMail info: Wrong stock data');
      return null;
    }
    if (user.length === 0) {
      this.logger.info('MailService:: sendMail info: User does not exist');
      return null;
    }
    if (!user[0].email) {
      this.logger.info('MailService:: sendMail info: User haven\'t set email');
      return null;
    }

    // 如果是链接商品, 只提供一份数据
    if (category[0].category_id === 3) {
      stock = [ stock[0] ];
    }

    let result = null;
    try {
      // 配置以及发送邮件
      const mailData = {
        username: user[0].username,
        productname: stock[0].title,
        productamount: user[0].num,
        stocks: stock,
        totalprice: (user[0].amount / 10000),
        time: user[0].create_time.toLocaleString(),
        symbol: user[0].symbol,
        category: category[0].category_id,
      };
      const mailContent = await this.ctx.renderView('mail.tpl', mailData, { viewEngine: 'nunjucks' });
      // 不发送邮件, 只返回预览
      // if (this.ctx.app.config.mailPreview === true) {
      //   return mailContent;
      // }
      const mailOptions = {
        //   from: this.config.mail.auth.user,
        from: `Smart Signature<${this.config.mail.auth.user}>`,
        to: user[0].email,
        subject: '瞬Matataki:您购买的商品',
        html: mailContent,
      };

      const transpoter = await nodemailer.createTransport(this.config.mail);
      result = await transpoter.sendMail(mailOptions);
    } catch (err) {
      this.logger.error('MailService:: sendMail error: %j', err);
      return null;
    }
    return result;
  }

  // 发送验证码邮件
  async sendCaptcha(email, captcha, type = consts.mailTemplate.registered) {
    if (!email || !captcha) {
      return null;
    }

    let result = null;
    try {
      let action = '';
      if (type === consts.mailTemplate.registered) {
        action = '注册';
      } else if (type === consts.mailTemplate.resetPassword) {
        action = '重置密码';
      }
      const mailData = {
        action,
        captcha,
      };

      const mailContent = await this.ctx.renderView('mail.html', mailData, { viewEngine: 'nunjucks' });
      // 不发送邮件, 只返回预览
      // if (this.ctx.app.config.mailPreview === true) {
      //   return mailContent;
      // }
      const mailOptions = {
        from: `Matataki<${this.config.mail.auth.user}>`,
        to: email,
        subject: `瞬Matataki:用户${action}`,
        html: mailContent,
      };
      const transpoter = await nodemailer.createTransport(this.config.mail);
      result = await transpoter.sendMail(mailOptions);
    } catch (err) {
      this.logger.error('MailService:: sendCaptcha error: %j', err);
      return null;
    }
    return result;
  }

}

module.exports = MailService;
