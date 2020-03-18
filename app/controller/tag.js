'use strict';

const Controller = require('../core/base_controller');

class TagController extends Controller {

  async tags() {
    const { type } = this.ctx.query;

    const pipeline = this.app.redis.multi();

    let idKey;

    switch (type) {
      case 'post':
        idKey = 'tag:post';
        break;

      case 'product':
        idKey = 'tag:product';
        break;

      default:
        pipeline.sunionstore('result', 'tag:post', 'tag:product').expire('result', 1);
        idKey = 'result';
        break;
    }

    const result = []
    const resultSet = (await pipeline.sort(idKey, 'GET', '#', 'GET', 'tag:*->name', 'GET', 'tag:*->type').exec())
    const [, resultLines] = resultSet[resultSet.length - 1];

    for (let i = 0; i < resultLines.length / 3; i++) {
      result.push({
        id: Number(resultLines[i * 3]),
        name: resultLines[(i * 3) + 1],
        type: resultLines[(i * 3) + 2]
      });
    }

    this.ctx.body = {
      ...this.ctx.msg.success,
      data: result
    };
  }
}

module.exports = TagController;
