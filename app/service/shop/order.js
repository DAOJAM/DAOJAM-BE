'use strict';
const consts = require('../consts');
const moment = require('moment');
const _ = require('lodash');
const Service = require('egg').Service;

// 商城订单类
class OrderService extends Service {
  // 处理购买、赞赏分开，可以购买多个
  // √ 云芝新 发邮件的地方，购买多个，发邮件使用orders
  // √ 云芝新 用户购买列表使用orders
  // √ 陈浩 购买的地方判断必须是商品频道
  // √ 陈浩 文章赞赏列表怎么办，supports+orders

  // √ 陈浩 product_stock_keys.support_id 要使用orders表的id，还需要再排查下

  // √ 陈浩 getPostProfile 返回文章详情属性使用orders，从orders里面查询是否已经买过，去掉查询key的代码，显示的地方，购买多个待删除

  // √ 陈浩 处理历史订单数据，supports-》orders

  // √ 陈浩 订单的评论
  // √ 陈浩 已经购买的商品bug

  // √ 陈浩 创建订单处理订单的评论
  // √ 陈浩 创建support时，处理评论

  // √ 陈浩 推荐返利，必须是消费过的人

  // √ 陈浩 验证eos合约
  // √ 陈浩 验证ont合约

  // 创建订单
  async create(userId, signId, contract, symbol, amount, platform, num, referreruid, trade_no = '', conn = null) {
    // 校验商品价格
    const prices = await this.service.post.getPrices(signId);
    const price = prices.find(p => p.platform === platform);
    if (!price) {
      return -1; // message.postCannotBuy;
    }
    // 总价错误
    if (amount !== price.price * num) {
      return -2; // message.postPriceError;
    }

    // 有可能在其他事务中调用该方法，如果conn是传进来的，不要在此commit和rollback
    let isOutConn = false;
    if (conn) {
      isOutConn = true;
    } else {
      conn = await this.app.mysql.beginTransaction();
    }

    const now = moment().format('YYYY-MM-DD HH:mm:ss');

    try {
      const result = await conn.query(
        'INSERT INTO orders (uid, signid, contract, symbol, num, amount, price, decimals, referreruid, platform, status, create_time, trade_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ? ,?, ?, ?, ?)',
        [ userId, signId, contract, symbol, num, amount, price.price, price.decimals, referreruid, platform, 0, now, trade_no ]
      );

      const updateSuccess = result.affectedRows === 1;

      const orderId = result.insertId;

      if (updateSuccess) {
        if (!isOutConn) {
          await conn.commit();
        }
        return orderId;
      }

      if (!isOutConn) {
        await conn.rollback();
      }
      return -3; // message.failure;

    } catch (err) {
      if (!isOutConn) {
        await conn.rollback();
      }
      this.ctx.logger.error('create order error', err, userId, signId, symbol, amount);
      return -99; // message.serverError;
    }
  }

  // 保存交易hash
  async saveTxhash(orderId, userId, hash) {
    const result = await this.app.mysql.update('orders', {
      txhash: hash,
    }, { where: { id: orderId, uid: userId } });

    return result;
  }


  async getByUserId(userId, signId) {
    return await this.app.mysql.get('orders', { uid: userId, signid: signId, status: 1 });
  }

  async get(userId, tradeNo) {
    const orders = await this.app.mysql.select('orders', {
      where: { uid: userId, trade_no: tradeNo },
      columns: [ 'signid', 'symbol', 'amount', 'price', 'status', 'create_time', 'trade_no' ], // todo：需要再增加
    });
    if (orders && orders.length > 0) {
      return orders[0];
    }
    return null;
  }

  // 处理发货
  async shipped(post, payment, conn) {
    // 判断文章所属频道，不是商品直接返回true
    if (post.channel_id !== consts.postChannels.product) {
      return true;
    }

    // 判断金额、数量、单价是否正确
    if (payment.amount < payment.num * payment.price) {
      this.ctx.logger.error('发货失败，订单金额、数量、单价不正确 %j', payment);
      return false;
    }

    // 减库存数量
    const resultStockQuantity = await conn.query(
      'UPDATE product_prices SET stock_quantity = stock_quantity - ? WHERE sign_id = ? AND stock_quantity >= ?;',
      [ payment.num, payment.signid, payment.num ]
    );

    // 没有库存，失败
    if (resultStockQuantity.affectedRows === 0) {
      this.logger.info('商品库存不足，sign_id:' + payment.signid);
      console.log('商品库存不足，sign_id:' + payment.signid);
      return false;
    }

    // 根据购买数量num锁定商品
    const resultKeys = await conn.query(
      'UPDATE product_stock_keys SET status=1, order_id = ? '
      + 'WHERE id IN (SELECT id FROM (SELECT id FROM product_stock_keys WHERE sign_id=? AND status=0 LIMIT ?) t);',
      [ payment.id, payment.signid, payment.num ]
    );

    // 库存不够，失败
    if (resultKeys.affectedRows !== payment.num) {
      this.logger.info('商品库存不足，sign_id:' + payment.signid);
      console.log('商品库存不足，sign_id:' + payment.signid);
      return false;
    }

    // 统计商品销量+payment.num
    await conn.query(
      'INSERT INTO post_read_count(post_id, real_read_count, sale_count, support_count, eos_value_count, ont_value_count)'
      + ' VALUES (?, 0, ?, 0, 0, 0) ON DUPLICATE KEY UPDATE sale_count = sale_count + ?;',
      [ payment.signid, payment.num, payment.num ]
    );

    return true;
  }

  // 获取用户已经购买的商品
  async getUserProducts(page = 1, pagesize = 20, userid = null) {

    this.app.mysql.queryFromat = function(query, values) {
      if (!values) return query;
      return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
          return this.escape(values[key]);
        }
        return txt;
      }.bind(this));
    };

    if (userid === null) {
      return null;
    }

    const countsql = 'SELECT COUNT(*) AS count ';
    const listsql = 'SELECT o.signid AS sign_id, o.id AS order_id, o.symbol, o.amount, o.create_time, o.price, o.amount, r.title, p.category_id, p.cover ';
    const wheresql = 'FROM orders o '
      + 'INNER JOIN product_prices r ON r.sign_id = o.signid AND r.platform = o.platform '
      + 'INNER JOIN posts p ON p.id = o.signid '
      + 'WHERE o.uid = :userid AND o.status = 1 ';
    const ordersql = 'ORDER BY o.create_time DESC LIMIT :start, :end ';

    const sqlcode = countsql + wheresql + ';' + listsql + wheresql + ordersql + ';';

    // 获取用户所有的订单
    const queryResult = await this.app.mysql.query(
      sqlcode,
      { userid, start: (page - 1) * pagesize, end: 1 * pagesize }
    );

    const amount = queryResult[0];
    const orders = queryResult[1];

    if (orders.length === 0) {
      return [];
    }

    // 取出订单的id列表
    const orderids = [];
    _.each(orders, row => {
      row.digital_copy = [];
      orderids.push(row.order_id);
    });

    // 取出订单对应的keys
    const keys = await this.app.mysql.query(
      'SELECT digital_copy, order_id FROM product_stock_keys WHERE order_id IN (:orderids);',
      { orderids }
    );

    // 给每个订单塞上key string
    for (let order_index = 0; order_index < orders.length; order_index += 1) {
      for (let key_index = 0; key_index < keys.length; key_index += 1) {
        if (orders[order_index].order_id === keys[key_index].order_id) {
          if (orders[order_index].category_id === 3) {
            orders[order_index].digital_copy.push(keys[key_index].digital_copy);
            break;
          } else {
            orders[order_index].digital_copy.push(keys[key_index].digital_copy);
          }
        }
      }
    }

    return { count: amount[0].count, list: orders };
  }

  async getUserArticle(page = 1, pagesize = 20, userid = null) {
    if (userid === null) {
      return null;
    }
    const selectSql = `
      SELECT o.create_time as buy_time, o.amount, o.decimals, o.platform,
      p.id, p.uid, p.author, p.title, p.hash, p.create_time, p.cover, p.require_holdtokens, p.require_buy,
      u.nickname, u.avatar
      FROM orders AS o
      LEFT JOIN posts as p ON o.signid = p.id
      LEFT JOIN users as u ON p.uid = u.id `;
    const whereSql = `
      WHERE o.uid = :userid AND o.status = 9 AND o.platform = 'cny' `;
    const countSql = `
      SELECT COUNT(1) AS count  
      FROM orders as o `;
    const orderSql = `
      ORDER BY o.create_time DESC LIMIT :offset, :limit; `;
    const sql = selectSql + whereSql + orderSql + countSql + whereSql + ';';
    this.ctx.logger.info('[service getUserArticle] sql', sql);
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: Number(pagesize),
      userid,
    });
    return {
      count: result[1][0].count,
      list: result[0],
    };
  }

  // 文章付费
  async payArticle(tradeNo, conn) {
    // 锁定订单，更新锁，悲观锁
    const result = await conn.query('SELECT * FROM orders WHERE trade_no = ? FOR UPDATE;', [ tradeNo ]);
    if (!result || result.length <= 0) {
      return 0;
    }

    const order = result[0];
    if (order.status !== 6) {
      return -1;
    }

    const article = await this.service.post.get(order.signid);

    // 转移cny
    const cnyTransferResult = await this.service.assets.transferFrom('CNY', order.uid, article.uid, order.amount, conn);
    // 转移资产失败
    if (!cnyTransferResult) {
      return -1;
    }

    // 更新文章付费订单
    const updOrderResult = await conn.query('UPDATE orders SET status = 9 WHERE trade_no = ?;', [ tradeNo ]);
    if (updOrderResult.affectedRows <= 0) {
      return -1;
    }

    return 0;
  }

  // 查询用户是否已经购买
  async isBuy(signId, userId) {
    // 查询订单
    const buy = await this.app.mysql.get('orders', { signid: signId, uid: userId, status: 9 });
    if (buy) {
      return true;
    }

    return false;
  }
}

module.exports = OrderService;
