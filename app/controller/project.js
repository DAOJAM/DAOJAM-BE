const Controller = require('../core/base_controller');

class ProjectController extends Controller {
  async index() {
    const { ctx } = this;
    const { pagesize = 10, page = 1, search = '', sort = 'votes' } = ctx.query;
    const result = await this.service.project.list(parseInt(page), parseInt(pagesize), sort, search);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async starList() {
    const { ctx } = this;
    const { pagesize = 10, page = 1, search = '', sort = 'votes' } = ctx.query;
    const result = await this.service.project.list(parseInt(page), parseInt(pagesize), sort, search, ctx.user.id);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
  async show() {
    const { ctx } = this;
    const { id } = ctx.params;
    const result = await this.service.project.get(id);
    ctx.body = {
      ...ctx.msg.success,
      data: result,
    };
  }
}
module.exports = ProjectController;
