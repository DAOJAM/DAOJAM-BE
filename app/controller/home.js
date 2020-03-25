'use strict';
const OSS = require('ali-oss');
const Controller = require('egg').Controller;

class HomeController extends Controller {
  async index() {
    this.ctx.body = 'hi, egg, version=1.6.8, ' + this.ctx.header['x-real-ip'];
  }
  // Forget about it, we changed the exposed key :)
}

module.exports = HomeController;
