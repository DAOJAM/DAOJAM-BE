'use strict';
const _ = require('lodash');
const Service = require('egg').Service;
const moment = require('moment');
const DEADLINE = 300; // 超时时间300秒

class ExchangeService extends Service {
  async createOrder(order, conn) {
    // 有可能在其他事务中调用该方法，如果conn是传进来的，不要在此commit和rollback
    let isOutConn = false;
    if (conn) {
      isOutConn = true;
    } else {
      conn = await this.app.mysql.beginTransaction();
    }

    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const deadline = parseInt(moment().format('X')) + DEADLINE; // 设置unix时间戳
    try {
      const result = await conn.query(
        'INSERT INTO exchange_orders(uid, token_id, cny_amount, token_amount, type, trade_no, openid, status, create_time, deadline, min_liquidity, max_tokens, min_tokens, recipient, ip, pay_cny_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [ order.uid, order.token_id, order.cny_amount, order.token_amount, order.type, order.trade_no, order.openid, order.status, now, deadline, order.min_liquidity, order.max_tokens, order.min_tokens, order.recipient, order.ip, order.pay_cny_amount ]
      );
      const createSuccess = (result.affectedRows !== 0);

      if (!isOutConn) {
        if (createSuccess) {
          await conn.commit();
        } else {
          await conn.rollback();
        }
      }
      return createSuccess;
    } catch (e) {
      if (!isOutConn) {
        await conn.rollback();
      }
      this.logger.error('MineTokenService.transferFrom exception. %j', e);
      return false;
    }
  }

  // 根据用户Id、订单号查询订单
  async get(userId, tradeNo) {
    const order = await this.app.mysql.get('exchange_orders', { uid: userId, trade_no: tradeNo });
    return order;
  }
  async getOrderAndSymbol(userId, tradeNo) {
    const sql = `
      SELECT t1.token_id, t1.pay_cny_amount, t1.cny_amount, t1.token_amount, t1.status, t1.type,
      t2.name, t2.symbol
      FROM exchange_orders as t1
      LEFT JOIN minetokens as t2
      ON t1.token_id = t2.id
      WHERE t1.trade_no=:tradeNo AND t1.uid=:userId;`;
    const result = await this.app.mysql.query(sql, {
      userId,
      tradeNo,
    });
    return result[0];
  }
  // 根据订单号查询
  async getOrderBytradeNo(trade_no) {
    const order = await this.app.mysql.get('exchange_orders', { trade_no });
    return order;
  }
  async updateStatus(trade_no, status) {
    status = parseInt(status);
    const statusOptions = [ 0, 3, 6, 9 ];
    const index = statusOptions.indexOf(status);
    if (index <= 0) {
      return false;
    }
    const setStatus = status;
    const whereStatus = statusOptions[index - 1];
    const conn = await this.app.mysql.beginTransaction();
    try {
      const sql = 'UPDATE exchange_orders SET status = :setStatus WHERE status = :whereStatus AND trade_no = :trade_no;';
      const result = await this.app.mysql.query(sql, {
        setStatus,
        whereStatus,
        trade_no,
      });
      await conn.commit();
      const updateSuccess = (result.affectedRows !== 0);
      return updateSuccess;
    } catch (err) {
      this.ctx.logger.error(err);
      await conn.rollback();
      return false;
    }
  }
  async setStatusPending(trade_no) {
    const result = await this.updateStatus(trade_no, 3);
    return result;
  }
  async setStatusPayed(trade_no) {
    const result = await this.updateStatus(trade_no, 6);
    return result;
  }
  async setStatusComplete(trade_no) {
    const result = await this.updateStatus(trade_no, 9);
    return result;
  }
  // 用户持有的币
  async getTokenListByUser(id, page = 1, pagesize = 20, order = 0) {
    const orderList = [
      'b.create_time DESC',
      'a.amount ASC',
      'a.amount DESC',
    ];
    const orderString = orderList[order] || orderList[0];

    const sql = 'SELECT a.token_id, a.amount, b.symbol, b.name, b.decimals, b.logo, b.uid, u.username, u.nickname, u.avatar '
      + 'FROM assets_minetokens AS a '
      + 'LEFT JOIN minetokens AS b ON a.token_id = b.id '
      + 'LEFT JOIN users u ON b.uid = u.id '
      + `WHERE a.uid = :id AND a.amount > 0 ORDER BY ${orderString} LIMIT :offset, :limit;`
      + 'SELECT count(1) as count FROM assets_minetokens WHERE uid = :id AND amount > 0;';
    const result = await this.app.mysql.query(sql, {
      id,
      offset: (page - 1) * pagesize,
      limit: pagesize,
    });
    const memberObj = await this.service.token.mineToken.countMember();

    _.each(result[0], row => {
      row.member = memberObj[row.id] || '0';
      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  // 根据粉丝币获取持仓用户列表
  async getUserListByToken(id, page = 1, pagesize = 20, sort = 'amount-desc') {
    let orderingColumn, direction;

    switch (sort) {
      case 'amount-desc':
        orderingColumn = 'amount';
        direction = 'DESC';
        break;

      case 'amount-asc':
        orderingColumn = 'amount';
        direction = 'ASC';
        break;

      case 'name-asc':
        orderingColumn = 'coalesce(nickname, username)';
        direction = 'ASC';
        break;

      case 'name-desc':
        orderingColumn = 'coalesce(nickname, username)';
        direction = 'DESC';
        break;

      default:
        return false;
    }

    id = parseInt(id);
    const sql = `SELECT a.*, b.total_supply, u.username, u.nickname, u.avatar
    FROM assets_minetokens AS a
    JOIN minetokens b ON b.id = a.token_id
    JOIN users u ON u.id = a.uid
    WHERE a.token_id = :id AND a.amount > 0
    ORDER BY ${orderingColumn} ${direction}
    LIMIT :offset, :limit;
    SELECT count(1) as count FROM assets_minetokens WHERE token_id = :id AND amount > 0;`;
    const result = await this.app.mysql.query(sql, {
      id,
      offset: (page - 1) * pagesize,
      limit: pagesize,
    });

    _.each(result[0], row => {
      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async getTokenBySymbol(symbol) {
    const sql = `SELECT t1.*, t2.username, t2.nickname, t2.avatar, t4.amount
                FROM mineTokens AS t1
                Left JOIN users AS t2 ON t1.uid = t2.id
                LEFT JOIN exchanges as t3 ON t1.id = t3.token_id
                LEFT JOIN assets_minetokens as t4 ON t3.exchange_uid = t4.uid AND t3.token_id = t4.token_id
                WHERE LOWER(t1.symbol) = LOWER(:symbol)`;
    const result = await this.app.mysql.query(sql, {
      symbol,
    });

    result[0].username = this.service.user.maskEmailAddress(result[0].username);

    return result[0] || null;
  }
  // 所有的token
  async getAllToken(page = 1, pagesize = 20, search = '', sort = 'general') {
    let sqlOrder = null;
    switch (sort) {
      case 'general':
        sqlOrder = ' ORDER BY ifnull(t6.amount, 0) * 1 + ifnull(t7.count, 0) * 1 + ifnull(t7.amount, 0) * 1 DESC';
        break;

      case 'name-asc':
      case 'symbol-asc':
        sqlOrder = ' ORDER BY symbol';
        break;
      case 'name-desc':
      case 'symbol-desc':
        sqlOrder = ' ORDER BY symbol DESC';
        break;

      case 'unit-price-asc':
        sqlOrder = ' ORDER BY t6.amount / t4.amount';
        break;
      case 'unit-price-desc':
        sqlOrder = ' ORDER BY t6.amount / t4.amount DESC';
        break;

      case 'liquidity-asc':
        sqlOrder = ' ORDER BY t6.amount';
        break;
      case 'liquidity-desc':
        sqlOrder = ' ORDER BY t6.amount DESC';
        break;

      case 'exchange-asc':
        sqlOrder = ' ORDER BY t7.amount';
        break;

      case 'exchange-desc':
        sqlOrder = ' ORDER BY t7.amount DESC';
        break;

      case 'id-asc':
        sqlOrder = ' ORDER BY t1.id';
        break;

      case 'id-desc':
        sqlOrder = ' ORDER BY t1.id DESC';
        break;
      case 'time-asc':
        sqlOrder = ' ORDER BY t1.create_time';
        break;
      case 'time-desc':
        sqlOrder = ' ORDER BY t1.create_time DESC';
        break;

      default:
        return false;
    }

    let sql, parameters;
    if (search === '') {
      sql = `SELECT t1.*, t2.username, t2.nickname, t2.avatar, t4.amount, ifnull(t6.amount, 0) AS liquidity, ifnull(t7.amount, 0) AS exchange_amount
          FROM mineTokens AS t1
          JOIN users AS t2 ON t1.uid = t2.id
          LEFT JOIN exchanges as t3 ON t1.id = t3.token_id
          LEFT JOIN assets_minetokens as t4 ON t3.exchange_uid = t4.uid AND t3.token_id = t4.token_id
          LEFT JOIN exchanges t5 ON t5.token_id = t1.id
          LEFT JOIN assets t6 ON t6.uid = t5.exchange_uid AND t6.symbol = 'CNY'
          LEFT JOIN (
            SELECT token_id, COUNT(amount) AS COUNT, IFNULL(SUM(ABS(amount)), 0) AS amount
            FROM exchanges e
            JOIN assets_change_log acl ON acl.uid = e.exchange_uid
            WHERE acl.create_time > DATE_SUB(NOW(), INTERVAL 1 DAY)
            GROUP BY token_id
          ) t7 ON t7.token_id = t1.id `
        + sqlOrder
        + ' LIMIT :offset, :limit;'
        + 'SELECT count(1) as count FROM mineTokens;';
      parameters = {
        offset: (page - 1) * pagesize,
        limit: pagesize,
      };
    } else {
      sql = `SELECT t1.*, t2.username, t2.nickname, t2.avatar, t4.amount, t6.amount AS liquidity, t7.amount AS exchange_amount
          FROM mineTokens AS t1
          JOIN users AS t2 ON t1.uid = t2.id
          LEFT JOIN exchanges as t3 ON t1.id = t3.token_id
          LEFT JOIN assets_minetokens as t4 ON t3.exchange_uid = t4.uid AND t3.token_id = t4.token_id
          LEFT JOIN exchanges t5 ON t5.token_id = t1.id
          LEFT JOIN assets t6 ON t6.uid = t5.exchange_uid AND t6.symbol = 'CNY'
          LEFT JOIN (
            SELECT token_id, COUNT(amount) AS COUNT, SUM(amount) AS amount
            FROM exchanges e
            JOIN assets_change_log acl ON acl.uid = e.exchange_uid
            WHERE acl.create_time > DATE_SUB(NOW(), INTERVAL 1 DAY)
            GROUP BY token_id
          ) t7 ON t7.token_id = t1.id
          WHERE Lower(t1.name) LIKE :search OR Lower(t1.symbol) LIKE :search `
        + sqlOrder
        + ' LIMIT :offset, :limit;'
        + 'SELECT count(1) as count FROM mineTokens WHERE Lower(name) LIKE :search OR Lower(symbol) LIKE :search;';
      parameters = {
        search: '%' + search.toLowerCase() + '%',
        offset: (page - 1) * pagesize,
        limit: pagesize,
      };
    }

    const result = await this.app.mysql.query(sql, parameters);
    const memberObj = await this.service.token.mineToken.countMember();

    _.each(result[0], row => {
      row.member = memberObj[row.id] || '0';
      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async getFlowDetail(tokenId, page = 1, pagesize = 20) {
    console.log(tokenId);
    const sql = 'SELECT * from exchange_orders WHERE token_id = :tokenId LIMIT :offset, :limit;'
      + 'SELECT count(1) as count FROM exchange_orders WHERE token_id = :tokenId;';
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      tokenId,
    });
    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async getUserFlowDetail(userId, tokenId, page = 1, pagesize = 20) {
    const sql = 'SELECT * from exchange_orders WHERE token_id = :tokenId AND uid = :userId LIMIT :offset, :limit;'
      + 'SELECT count(1) as count FROM exchange_orders WHERE token_id = :tokenId AND uid = :userId;';
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      userId,
      tokenId,
    });
    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async getUserBalance(userId, tokenId) {
    const sql = 'SELECT t1.*, t2.decimals FROM `assets_minetokens` as t1'
      + ' LEFT JOIN `minetokens` as t2 ON t1.token_id = t2.id '
      + 'WHERE t1.uid = :userId AND t1.token_id = :tokenId';
    const result = await this.app.mysql.query(sql, {
      userId,
      tokenId,
    });
    return result[0];
  }
}
module.exports = ExchangeService;
