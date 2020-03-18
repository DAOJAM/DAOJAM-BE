const Subscription = require('egg').Subscription;
const moment = require('moment');

class UpdateCache extends Subscription {
  // 通过 schedule 属性来设置定时任务的执行间隔等配置
  static get schedule() {
    return {
      interval: '2m', // 2 分钟间隔
      type: 'worker', // 指定所有的 worker 都需要执行
    };
  }

  // subscribe 是真正定时任务执行时被运行的函数
  async subscribe() {
    return; // disabled for no wechat pay
    if (this.ctx.app.config.isDebug) return;
    const { ctx } = this;
    const orders = await this.getExchangeOrder();
    const len = orders.length;
    for (let i = 0; i < len; i++) {
      const order = orders[i];
      const trade_no = order.trade_no;
      const result = await this.app.tenpay.orderQuery({
        out_trade_no: trade_no,
      });
      if (result.return_code === 'SUCCESS' && result.trade_state === 'SUCCESS') {
        ctx.service.exchange.setStatusPayed(trade_no);
      }
    }
  }
  async getExchangeOrder() {
    const sql = 'SELECT * FROM exchange_orders WHERE create_time >= :time AND `status` = 3;';
    const time = moment().subtract(6, 'minutes').format('YYYY-MM-DD HH:mm:ss');
    const result = await this.app.mysql.query(sql, {
      time,
    });
    return result;
  }
}

module.exports = UpdateCache;
