'use strict';
const Controller = require('../core/base_controller');

class MetadataController extends Controller {
  async get() {
    const { ctx } = this;
    const { url } = ctx.request.body;
    try {
      const metadata = await this.service.metadata.GetFromUrl(url);
      this.ctx.body = {
        ...ctx.msg.success,
        data: metadata,
      };
    } catch (error) {
      this.ctx.body = {
        ...ctx.msg.failure,
        error,
      };
    }
  }
}

module.exports = MetadataController;
