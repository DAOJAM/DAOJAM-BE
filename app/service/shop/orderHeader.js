'use strict';
const moment = require('moment');

const Service = require('egg').Service;
const typeOptions = {
  add: 'add',
  buy_token_input: 'buy_token_input',
  buy_token_output: 'buy_token_output',
  sale_token: 'sale_token',
};

class OrderHeaderService extends Service {
  // 以下是CNY支付相关处理 2019-11-13
  async createOrder(userId, items, useBalance, ip) {
    // 查询文章价格
    let total = 0;
    const trade_no = this.ctx.helper.genCharacterNumber(31);

    // todo:自己的文章不用购买

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 拆分订单到orders、exchange_orders
      for (const item of items) {
        if (item.type === 'buy_post') {
          const prices = await this.ctx.service.post.getPrices(item.signId);
          if (!prices || prices.length <= 0) {
            await conn.rollback();
            return '-1';
          }

          // 先判断有没有购买过文章
          if (await this.service.shop.order.isBuy(userId, item.signId)) {
            await conn.rollback();
            return '-1';
          }
          // 创建购买文章订单行
          const result = await this.service.shop.order.create(userId, item.signId, '', prices[0].symbol, prices[0].price, prices[0].platform, 1, 0, trade_no, conn);
          if (result <= 0) {
            await conn.rollback();
            return '-1';
          }
          total = total + prices[0].price;
        } else if (typeOptions[item.type]) {
          let cny_amount = 0;
          let token_amount = 0;
          let max_tokens = 0;
          let min_tokens = 0;
          let min_liquidity = 0;
          switch (item.type) {
            case typeOptions.buy_token_output: {
              token_amount = item.amount;
              cny_amount = await this.service.token.exchange.getCnyToTokenOutputPrice(item.tokenId, token_amount);
              max_tokens = cny_amount;
              min_tokens = this.calMinTokenByOutput(token_amount);
              break;
            }
            case typeOptions.buy_token_input: {
              cny_amount = item.cny_amount;
              token_amount = await this.service.token.exchange.getCnyToTokenInputPrice(item.tokenId, cny_amount);
              min_tokens = this.calMinTokenByInput(token_amount);
              break;
            }
            case typeOptions.add: {
              cny_amount = item.cny_amount;
              // 判断是否有交易对
              const tokenResult = await this.service.token.exchange.getPoolCnyToTokenPrice(item.tokenId, cny_amount);
              if (tokenResult < 0) token_amount = item.amount;
              else token_amount = tokenResult;
              max_tokens = this.calMaxToken(token_amount);
              min_liquidity = await this.service.token.exchange.getYourMintToken(cny_amount, item.tokenId);
              break;
            }
          }
          if (cny_amount <= 0) {
            await conn.rollback();
            return '-1';
          }
          // 创建购买粉丝币订单行
          const result = await this.service.exchange.createOrder(
            {
              uid: userId, // 用户id
              token_id: item.tokenId, // 购买的token id
              cny_amount,
              pay_cny_amount: 0,
              token_amount,
              type: typeOptions[item.type], // 类型：add，buy_token，sale_token
              trade_no, // 订单号
              openid: '',
              status: 0, // 状态，0初始，3支付中，6支付成功，9处理完成
              min_liquidity, // 资金池pool最小流动性，type = add
              max_tokens, // output为准，最多获得CNY，type = sale_token
              min_tokens, // input为准时，最少获得Token，type = buy_token
              recipient: userId, // 接收者
              ip, // ip
            }, conn
          );
          if (!result) {
            await conn.rollback();
            return '-1';
          }
          total = total + cny_amount;
        }
      }

      let amount = total;
      // 使用余额支付
      if (useBalance === 1) {
        const balance = await this.service.assets.balanceOf(userId, 'CNY');
        amount = total - balance;
        if (amount < 0) {
          amount = 0;
        }
      }

      // 处理到分，向上取整
      amount = Math.ceil(amount / 100) * 100;
      const headerResult = await conn.query('INSERT INTO order_headers(uid, trade_no, total, amount, create_time, status, ip, use_balance) VALUES(?,?,?,?,?,?,?,?);',
        [ userId, trade_no, total, amount, moment().format('YYYY-MM-DD HH:mm:ss'), 0, ip, useBalance ]);
      if (headerResult.affectedRows <= 0) {
        await conn.rollback();
        return '-1';
      }

      await conn.commit();
      return trade_no;
    } catch (e) {
      await conn.rollback();
      this.logger.error('OrderHeaderService.createOrder exception. %j', e);
      return '-1';
    }
  }

  calMinTokenByInput(amount) {
    return parseFloat((parseFloat(amount) * (1 - 0.01)).toFixed(4));
  }
  calMinTokenByOutput(amount) {
    return parseFloat((parseFloat(amount) / (1 - 0.01)).toFixed(4));
  }
  calMaxToken(amount) {
    return parseFloat((parseFloat(amount) / (1 - 0.02)).toFixed(4));
  }

  // 修改还未支付的订单
  async updateOrder(userId, tradeNo, useBalance) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      const result = await conn.query('SELECT * FROM order_headers WHERE trade_no = ? AND (status = 0 OR status = 3) FOR UPDATE;', [ tradeNo ]);
      if (!result || result.length <= 0) {
        await conn.rollback();
        return -1;
      }

      const order = await this.service.shop.order.get(userId, tradeNo);
      const exorder = await this.service.exchange.get(userId, tradeNo);

      let total = 0;
      if (order) {
        total = total + order.amount;
      }
      if (exorder) {
        total = total + exorder.cny_amount;
      }

      let amount = total;
      // 使用余额支付
      if (useBalance === 1) {
        const balance = await this.service.assets.balanceOf(userId, 'CNY');
        amount = total - balance;
        if (amount < 0) {
          amount = 0;
        }
      }

      // 处理到分，向上取整
      amount = Math.ceil(amount / 100) * 100;
      await conn.query('UPDATE order_headers SET amount = ?, use_balance = ? WHERE trade_no = ? AND (status = 0 OR status = 3);', [ amount, useBalance, tradeNo ]);

      await conn.commit();

      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('OrderHeaderService.paySuccess exception. %j', e);
      return -2;
    }

  }

  // 根据用户Id、订单号获取订单详细信息
  async get(uid, tradeNo) {
    const orderHeader = await this.app.mysql.query('SELECT trade_no, total, amount, create_time, status, use_balance FROM order_headers WHERE uid = ? AND trade_no = ?; ', [ uid, tradeNo ]);
    if (orderHeader && orderHeader.length > 0) { return orderHeader[0]; }
    return null;
  }

  // 处理不需要支付的订单
  async handleAmount0(userId, tradeNo) {
    const order = await this.get(userId, tradeNo);
    if ((order.status === 0 || order.status === 3) && order.amount === 0) {
      await this.setStatusPaying(tradeNo);
      const payResult = await this.paySuccessful(tradeNo);
      return payResult;
    }
    return false;
  }

  // 更新订单状态为支付中
  async setStatusPaying(tradeNo) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      const sql = `UPDATE order_headers SET status = 3 WHERE status = 0 AND trade_no = :trade_no;
                 UPDATE orders SET status = 3 WHERE status = 0 AND trade_no = :trade_no;
                 UPDATE exchange_orders SET status = 3 WHERE status = 0 AND trade_no = :trade_no;`;
      const result = await conn.query(sql, { trade_no: tradeNo });
      await conn.commit();
      const updateSuccess = (result.affectedRows !== 0);
      return updateSuccess;
    } catch (err) {
      this.ctx.logger.error(err);
      await conn.rollback();
      return false;
    }
  }

  // 更新订单状态为已支付
  async setStatusPaySuccessful(tradeNo) {
    // todo:支付成功，更新状态:
    // order_headers.status = 6
    // orders.status = 6
    // exchange_orders = 6
    const conn = await this.app.mysql.beginTransaction();
    try {
      const sql = `UPDATE order_headers SET status = 6 WHERE status = 3 AND trade_no = :trade_no;
                 UPDATE orders SET status = 6 WHERE status = 3 AND trade_no = :trade_no;
                 UPDATE exchange_orders SET status = 6 WHERE status = 3 AND trade_no = :trade_no;`;
      const result = await conn.query(sql, { trade_no: tradeNo });
      await conn.commit();
      const updateSuccess = (result.affectedRows !== 0);
      return updateSuccess;
    } catch (err) {
      this.ctx.logger.error(err);
      await conn.rollback();
      return false;
    }
  }

  // 微信支付成功通知内调用该方法
  async paySuccessful(tradeNo) {
    const statusResult = await this.setStatusPaySuccessful(tradeNo);
    if (statusResult) {
      const processResult = await this.processingOrder(tradeNo);
      return processResult >= 0;
    }
    return false;
  }

  // 处理订单，paySuccessful之后调用
  async processingOrder(tradeNo) {
    const result = await this.handling(tradeNo);
    this.logger.info('service.shop.orderHeader method processingOrder', result);
    if (result < 0) {
      // 交易失败
      await this.app.mysql.query('UPDATE order_headers SET status = 7 WHERE trade_no = ?;', [ tradeNo ]);
      // 退款
      await this.refundOrder(tradeNo);
      return -1;
    }

    return 0;
  }

  // 处理买文章、买币
  async handling(tradeNo) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      const result = await conn.query('SELECT * FROM order_headers WHERE trade_no = ? AND status = 6 FOR UPDATE;', [ tradeNo ]);
      if (!result || result.length <= 0) {
        await conn.rollback();
        return -1;
      }
      const orderHeader = result[0];

      // 订单付款成功，给用户充值
      if (orderHeader.amount > 0) {
        await this.service.assets.recharge(orderHeader.uid, 'CNY', orderHeader.amount, conn);
      }
      // 购买文章，支付给作者
      const payArticleResult = await this.service.shop.order.payArticle(tradeNo, conn);
      if (payArticleResult < 0) {
        await conn.rollback();
        return -2;
      }

      // 买币
      const buyTokenResult = await this.service.token.exchange.cnyToTokenSubOrder(tradeNo, conn);
      if (buyTokenResult < 0) {
        await conn.rollback();
        return -3;
      }

      // 更改订单头状态
      await conn.query('UPDATE order_headers SET status = 9 WHERE trade_no = ?;', [ tradeNo ]);

      // const order = await this.service.shop.order.get(orderHeader.uid, tradeNo);
      // // 查询是否满足持币数量
      // const isHold = await this.service.post.isHoldMineTokens(order.signid, orderHeader.uid);
      // if (!isHold) {
      //   await conn.rollback();
      //   return -4;
      // }

      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('OrderHeaderService.handling exception. %j', e);
      return -5;
    }
  }


  // 订单退款
  async refundOrder(tradeNo) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      // 锁定订单，更新锁，悲观锁
      const result = await conn.query('SELECT * FROM order_headers WHERE trade_no = ? AND status = 7 FOR UPDATE;', [ tradeNo ]);
      if (!result || result.length <= 0) {
        await conn.rollback();
        return -1;
      }
      const order = result[0];
      // 微信订单实际支付的CNY金额
      const amount = order.amount;
      // 付款金额为0，不需要退款，直接关闭
      if (amount === 0) {
        await conn.query('UPDATE order_headers SET status = 8 WHERE trade_no = ?;', [ tradeNo ]);
        await conn.commit();
        return -1;
      }


      // const res = await this.service.wxpay.refund(tradeNo, amount / 10000, amount / 10000);
      const res = {
        return_code: 'SUCCESS',
      };
      // 申请退款接收成功，todo：处理退款结果通知，写到数据库status=10；todo：如果退款接收失败，还需要再次调用，放到schedule里面调用退款比较好
      if (res.return_code === 'SUCCESS' && res.result_code === 'SUCCESS') {
        await conn.query('UPDATE order_headers SET status = 8 WHERE trade_no = ?;', [ tradeNo ]);
      }
      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('OrderHeaderService.refundOrder exception. %j', e);
      return -1;
    }
  }
}

module.exports = OrderHeaderService;
