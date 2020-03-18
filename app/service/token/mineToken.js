'use strict';
const _ = require('lodash');
const moment = require('moment');
const Service = require('egg').Service;
const Token = require('../ethereum/Token');
const consts = require('../consts');

class MineTokenService extends Service {

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

  // 作者创建一个token
  async create(userId, name, symbol, initialSupply, decimals, logo, brief, introduction, txHash) {
    let token = await this.getByUserId(userId);
    if (token) {
      return -1;
    }

    token = await this.getBySymbol(symbol);
    if (token) {
      return -2;
    }

    // 是否有权限发币
    if (!await this.hasCreatePermission(userId)) {
      return -3;
    }

    // 与主流币种重名
    if (this.config.token.maintokens.indexOf(symbol.toUpperCase()) >= 0) {
      return -2;
    }

    const sql = 'INSERT INTO minetokens(uid, name, symbol, decimals, total_supply, create_time, status, logo, brief, introduction) '
      //                      ⬇️⬅️ 故意把 Status 设为 0，合约部署成功了 worker 会把它设置回 1 (active)
      + 'SELECT ?,?,?,?,0,?,0,?,?,? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM minetokens WHERE uid=? OR symbol=?);';
    const create_time = moment().format('YYYY-MM-DD HH:mm:ss');
    const result = await this.app.mysql.query(sql,
      [ userId, name, symbol, decimals, create_time, logo, brief, introduction, userId, symbol ]);
    await this.emitIssueEvent(userId, result.insertId, null, txHash);
    await this._mint(result.insertId, userId, initialSupply, null, null);
    await this.service.tokenCircle.api.addTokenProfile(result.insertId, name, symbol, userId, 'NULL');
    // es里添加新加入的fan票
    await this.service.search.importToken({
      id: result.insertId,
      name,
      symbol,
      brief,
      introduction,
      contract_address: txHash,
    });
    return result.insertId;
  }

  async emitIssueEvent(from_uid, tokenId, ip, transactionHash) {
    // 现在要留存发币后上链结果的hash，以留存证据
    return this.app.mysql.query('INSERT INTO assets_minetokens_log(from_uid, to_uid, token_id, amount, create_time, ip, type, tx_hash) VALUES(?,?,?,?,?,?,?,?);',
      [ from_uid, 0, tokenId, 0, moment().format('YYYY-MM-DD HH:mm:ss'),
        ip, consts.mineTokenTransferTypes.issue, transactionHash,
      ]);
  }

  // 更新粉丝币信息
  async update(userId, tokenId, name, logo, brief, introduction) {
    const row = {};
    row.name = name;
    row.logo = logo;
    row.brief = brief;
    row.introduction = introduction;

    const options = {
      where: { uid: userId, id: tokenId },
    };

    const result = await this.app.mysql.update('minetokens', row, options);
    return result.affectedRows > 0;
  }

  // 更新粉丝币合约地址
  async updateContractAddress(userId, tokenId, contract_address) {
    const options = {
      where: { uid: userId, id: tokenId },
    };

    const result = await this.app.mysql.update('minetokens', { contract_address }, options);
    return result.affectedRows > 0;
  }

  /**
   * 获取token信息
   * @param {object} parameters 查找的参数
   */
  async getToken(parameters) {
    const token = await this.app.mysql.get('minetokens', parameters);
    return token;
  }

  /**
   * 通过ID获取token信息
   * @param {number} id token的ID
   */
  get(id) {
    return this.getToken({ id });
  }

  // 获取token
  getBySymbol(symbol) {
    return this.getToken({ symbol });
  }

  // 获取token
  getByUserId(uid) {
    return this.getToken({ uid });
  }

  // 保存网址、社交媒体账号
  async saveResources(userId, tokenId, websites, socials) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      await conn.query('DELETE FROM minetoken_resources WHERE token_id = ?;', [ tokenId ]);

      for (const website of websites) {
        await conn.insert('minetoken_resources', {
          token_id: tokenId,
          type: 'website',
          content: website,
          create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        });
      }

      for (const social of socials) {
        if (consts.socialTypes.indexOf(social.type) >= 0) {
          await conn.insert('minetoken_resources', {
            token_id: tokenId,
            type: social.type,
            content: social.content,
            create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
          });
        }
      }

      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -1;
    }
  }

  // 获取网址、社交媒体账号
  async getResources(tokenId) {
    const result = await this.app.mysql.query('SELECT type, content FROM minetoken_resources WHERE token_id = ?;', [ tokenId ]);
    // const websites = result.filter(row => row.type === 'website');
    // const socials = result.filter(row => row.type !== 'website');;
    const websites = [];
    const socials = [];
    if (result) {
      for (const row of result) {
        if (row.type === 'website') {
          websites.push(row.content);
        } else {
          socials.push(row);
        }
      }
    }

    return {
      websites,
      socials,
    };
  }

  async hasCreatePermission(userId) {
    const user = await this.service.user.get(userId);
    const hasMineTokenPermission = consts.userStatus.hasMineTokenPermission;
    // eslint-disable-next-line no-bitwise
    return (user.status & hasMineTokenPermission) === hasMineTokenPermission;
    /* if (user.level > 0) {
      return true;
    }
    return false; */
  }

  async hasMintPermission(tokenId, userId) {
    const sql = 'SELECT 1 FROM minetokens WHERE id=? AND uid=?;';
    const result = await this.app.mysql.query(sql, [ tokenId, userId ]);
    return result;
  }

  // 是否可以发行
  async canMint(tokenId, amount, conn) {
    const result = await conn.query('SELECT total_supply FROM minetokens WHERE id=? FOR UPDATE;',
      [ tokenId ]);
    const token = result[0];
    // 上限1亿token
    if (1000000000000 - token.total_supply < amount) {
      return false;
    }
    return true;
  }

  // 铸币
  async mint(fromUid, toUid, amount, ip) {
    const token = await this.getByUserId(fromUid);
    if (!token) {
      return -2;
    }
    const EtherToken = new Token(20, token.contract_address);
    const [ fromWallet, toWallet ] = await Promise.all([
      this.service.account.hosting.isHosting(fromUid, 'ETH'),
      this.service.account.hosting.isHosting(toUid, 'ETH'),
    ]);
    const { private_key } = fromWallet;
    const { public_key: target } = toWallet;
    let transactionHash;
    try {
      const blockchainMintAction = await EtherToken._mint(private_key, target, amount);
      this.logger.info('Minting token', token, blockchainMintAction);
      transactionHash = blockchainMintAction.transactionHash;
    } catch (error) {
      console.error(error);
    }

    const tokenId = token.id;

    const conn = await this.app.mysql.beginTransaction();
    try {
      if (!await this.canMint(tokenId, amount, conn)) {
        await conn.rollback();
        return -3;
      }

      // 唯一索引`uid`, `token_id`
      await conn.query('INSERT INTO assets_minetokens(uid, token_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ toUid, tokenId, amount, amount ]);

      await conn.query('UPDATE minetokens SET total_supply = total_supply + ? WHERE id = ?;',
        [ amount, tokenId ]);

      // 现在要写入上链结果的hash
      await conn.query('INSERT INTO assets_minetokens_log(from_uid, to_uid, token_id, amount, create_time, ip, type, tx_hash) VALUES(?,?,?,?,?,?,?,?);',
        [ 0, toUid, tokenId, amount, moment().format('YYYY-MM-DD HH:mm:ss'),
          ip, consts.mineTokenTransferTypes.mint, transactionHash,
        ]);

      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('MineTokenService.mint exception. %j', e);
      return -1;
    }
  }

  async _mint(tokenId, to, amount) {
    const conn = await this.app.mysql.beginTransaction();
    try {
      if (!await this.canMint(tokenId, amount, conn)) {
        await conn.rollback();
        return -3;
      }

      // 唯一索引`uid`, `token_id`
      await conn.query('INSERT INTO assets_minetokens(uid, token_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ to, tokenId, amount, amount ]);

      await conn.query('UPDATE minetokens SET total_supply = total_supply + ? WHERE id = ?;',
        [ amount, tokenId ]);

      // 现在要写入上链结果的hash
      await conn.query('INSERT INTO assets_minetokens_log(from_uid, to_uid, token_id, amount, create_time, type) VALUES(?,?,?,?,?,?);',
        [ 0, to, tokenId, amount, moment().format('YYYY-MM-DD HH:mm:ss'),
          consts.mineTokenTransferTypes.mint ]);

      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.logger.error('MineTokenService.mint exception: ', e);
      return -1;
    }
  }

  async getHostingWallet(uid) {
    return this.service.account.hosting.isHosting(uid, 'ETH');
  }

  async transferFrom(tokenId, from, to, value, ip, type = '', conn) {
    this.logger.error('mineToken.transferFrom start: ', { tokenId, from, to, value, ip, type });
    if (from === to) {
      this.logger.error('mineToken.transferFrom failed: from === to', { from, to });
      return false;
    }

    // 有可能在其他事务中调用该方法，如果conn是传进来的，不要在此commit和rollback
    let isOutConn = false;
    if (conn) {
      isOutConn = true;
    } else {
      conn = await this.app.mysql.beginTransaction();
    }
    const [ fromWallet, toWallet ] = await Promise.all(
      [ from, to ].map(id => this.getHostingWallet(id))
    );
    try {
      const amount = parseInt(value);
      // 减少from的token
      const result = await conn.query('UPDATE assets_minetokens SET amount = amount - ? WHERE uid = ? AND token_id = ? AND amount >= ?;',
        [ amount, from, tokenId, amount ]);
      // 减少from的token失败回滚
      if (result.affectedRows <= 0) {
        if (!isOutConn) {
          await conn.rollback();
        }
        this.logger.error('mineToken.transferFrom UPDATE assets_minetokens failed: ', result);
        return false;
      }

      const token = await this.get(tokenId);
      const EtherToken = new Token(20, token.contract_address);
      let transactionHash;
      try {
        const transferAction = await EtherToken.transfer(
          fromWallet.private_key, toWallet.public_key, amount);
        transactionHash = transferAction.transactionHash;
      } catch (error) {
        this.logger.error('transferFrom::syncBlockchain', error);
      }

      // 增加to的token
      await conn.query('INSERT INTO assets_minetokens(uid, token_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ to, tokenId, amount, amount ]);

      // 记录日志
      await conn.query('INSERT INTO assets_minetokens_log(from_uid, to_uid, token_id, amount, create_time, ip, type, tx_hash) VALUES(?,?,?,?,?,?,?,?);',
        [ from, to, tokenId, amount, moment().format('YYYY-MM-DD HH:mm:ss'), ip, type, transactionHash ]);

      if (!isOutConn) {
        await conn.commit();
      }
      return transactionHash;
    } catch (e) {
      if (!isOutConn) {
        await conn.rollback();
      }
      this.logger.error('MineTokenService.transferFrom exception. %j', e);
      return false;
    }
  }

  /**
   * batchTransfer, 批量转账
   * @param {number} tokenId 饭票的ID
   * @param {number} sender 发送方的UID
   * @param {Array<Target>} targets 收币方详情，必须有 `to` 和 `amount` 字段
   */
  async batchTransfer(tokenId, sender, targets) {
    const recipients = targets.map(i => i.to);
    const amounts = targets.map(i => i.amount);
    const [ token, fromWallet ] = await Promise.all([
      this.service.token.mineToken.get(tokenId),
      this.service.account.hosting.isHosting(sender, 'ETH'),
    ]);
    const recipientWallets = await Promise.all(
      recipients.map(id => this.service.account.hosting.isHosting(id, 'ETH'))
    );
    const recipientPublicKey = recipientWallets.map(w => w.public_key);
    const { transactionHash } = await this.service.ethereum.multisender.delegateSendToken(
      token.contract_address, fromWallet.public_key, recipientPublicKey, amounts
    );
    // Update DB
    const dbConnection = await this.app.mysql.beginTransaction();
    for (let i = 0; i < recipients.length; i++) {
      await this._syncTransfer(
        tokenId, sender, recipients[i], amounts[i], this.clientIP,
        consts.mineTokenTransferTypes.transfer, transactionHash, dbConnection);
    }
    await dbConnection.commit();
    return transactionHash;
  }


  // 链上交易已完成，同步到数据库
  async _syncTransfer(tokenId, from, to, value, ip, type = '', transactionHash, conn) {
    if (from === to) {
      return false;
    }

    try {
      const amount = parseInt(value);
      // 减少from的token
      await conn.query('UPDATE assets_minetokens SET amount = amount - ? WHERE uid = ? AND token_id = ? AND amount >= ?;',
        [ amount, from, tokenId, amount ]);

      // 增加to的token
      await conn.query('INSERT INTO assets_minetokens(uid, token_id, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?;',
        [ to, tokenId, amount, amount ]);

      // 记录日志
      await conn.query('INSERT INTO assets_minetokens_log(from_uid, to_uid, token_id, amount, create_time, ip, type, tx_hash) VALUES(?,?,?,?,?,?,?,?);',
        [ from, to, tokenId, amount, moment().format('YYYY-MM-DD HH:mm:ss'), ip, type, transactionHash ]);

      return true;
    } catch (e) {
      await conn.rollback();
      this.logger.error('MineTokenService._syncTransfer exception. %j', e);
      return false;
    }
  }

  async burn(userId, value) {
    // todo
    return false;
  }

  async balanceOf(userId, tokenId) {
    const balance = await this.app.mysql.get('assets_minetokens', { uid: userId, token_id: tokenId });

    if (!balance) {
      return 0;
    }

    return balance.amount;
  }

  async getTokenLogs(tokenId, page = 1, pagesize = 20) {
    const sql
      = `SELECT t.token_id, t.from_uid, t.to_uid, t.amount, t.create_time, t.type, t.tx_hash,
        m.name, m.symbol, m.decimals,
        u1.username AS from_username, u1.nickname AS from_nickname,u1.avatar AS from_avatar,
        u2.username AS to_username, u2.nickname AS to_nickname,u2.avatar AS to_avatar
        FROM (
          SELECT * FROM assets_minetokens_log WHERE token_id = :tokenId ORDER BY id DESC LIMIT :offset, :limit
        ) t
        JOIN minetokens m ON m.id = t.token_id
        LEFT JOIN users u1 ON t.from_uid = u1.id
        LEFT JOIN users u2 ON t.to_uid = u2.id;
        SELECT count(1) AS count FROM assets_minetokens_log WHERE token_id = :tokenId;`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      tokenId,
    });

    _.each(result[0], row => {
      row.from_username = this.service.user.maskEmailAddress(row.from_username);
      row.to_username = this.service.user.maskEmailAddress(row.to_username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }

  // 查看用户的token日志
  async getUserLogs(tokenId, userId, page = 1, pagesize = 20) {
    const sql
      = `SELECT t.token_id, t.from_uid, t.to_uid, t.amount, t.create_time, t.type, t.tx_hash,
        m.name, m.symbol, m.decimals,
        u1.username AS from_username, u1.nickname AS from_nickname,u1.avatar AS from_avatar,
        u2.username AS to_username, u2.nickname AS to_nickname,u2.avatar AS to_avatar
        FROM (
          SELECT * FROM assets_minetokens_log WHERE token_id = :tokenId AND (from_uid = :userId OR to_uid = :userId) ORDER BY id DESC LIMIT :offset, :limit
        ) t
        JOIN minetokens m ON m.id = t.token_id
        LEFT JOIN users u1 ON t.from_uid = u1.id
        LEFT JOIN users u2 ON t.to_uid = u2.id;
        SELECT count(1) AS count FROM assets_minetokens_log WHERE token_id = :tokenId AND (from_uid = :userId OR to_uid = :userId);`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      userId,
      tokenId,
    });

    _.each(result[0], row => {
      row.from_username = this.service.user.maskEmailAddress(row.from_username);
      row.to_username = this.service.user.maskEmailAddress(row.to_username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }

  getAllTokens() {
    return this.app.mysql.select('minetokens');
  }

  async getHoldLiquidity(userId, page = 1, pagesize = 10, order = 0) {
    const orderList = [
      't1.create_time DESC',
      't1.liquidity_balance ASC',
      't1.liquidity_balance DESC',
    ];
    const orderString = orderList[order] || orderList[0];

    const sql = `
      SELECT t1.token_id, t1.liquidity_balance, t1.create_time,
        t2.total_supply,
        t3.name, t3.symbol, decimals, t3.logo,
        t4.username, t4.nickname
      FROM exchange_balances AS t1
      JOIN exchanges AS t2 USING (token_id)
      JOIN minetokens AS t3 ON t1.token_id = t3.id
      JOIN users as t4 ON t3.uid = t4.id
      WHERE t1.uid = :userId
      ORDER BY ${orderString}
      LIMIT :offset, :limit;
      SELECT count(1) AS count FROM exchange_balances WHERE uid = :userId;`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      userId,
    });

    _.each(result[0], row => {
      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }

  async getLiquidityLogs(tokenId, userId = null, page = 1, pagesize = 10) {
    let sql = `
      SELECT t1.id, t1.uid, t1.token_id, t1.cny_amount, t1.token_amount, t1.liquidity, t1.create_time,
      t3.name, t3.symbol, t3.decimals, t3.total_supply, t3.logo,
      t4.username, t4.nickname,
      t2.tx_hash
      FROM exchange_liquidity_logs AS t1
      JOIN assets_minetokens_log t2 USING (token_id, create_time)
      JOIN minetokens AS t3 ON t1.token_id = t3.id
      JOIN users as t4 ON t3.uid = t4.id
      `;
    let params = {
      tokenId,
    };
    if (userId) {
      sql += `
        WHERE t1.uid = :userId AND t1.token_id = :tokenId
        ORDER BY t1.create_time DESC
        LIMIT :offset, :limit;
        SELECT count(1) AS count FROM exchange_liquidity_logs
        WHERE uid = :userId AND token_id = :tokenId;`;
      params = {
        ...params,
        userId,
      };
    } else {
      sql += `
        WHERE t1.token_id = :tokenId
        ORDER BY t1.create_time DESC
        LIMIT :offset, :limit;
        SELECT count(1) AS count FROM exchange_liquidity_logs
        WHERE token_id = :tokenId;`;
    }

    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      ...params,
    });

    _.each(result[0], row => {
      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }

  async getPurchaseLog(tokenId, userId = null, page = 1, pagesize = 100) {
    let sql = `
      SELECT t1.*, t2.tx_hash,
      CASE WHEN t1.sold_token_id = :tokenId
      THEN 'sell' ELSE 'buy'
      END 'direction'
      FROM exchange_purchase_logs AS t1
      JOIN assets_minetokens_log t2 ON t1.create_time = t2.create_time AND token_id = :tokenId
      WHERE (t1.sold_token_id = :tokenId OR t1.bought_token_id = :tokenId)`;
    let params = {
      tokenId,
    };
    // 如果useId存在
    if (userId) {
      sql += `
        AND (uid = :userId OR recipient = :userId)
        ORDER BY create_time DESC LIMIT :offset, :limit;`;
      params = {
        ...params,
        userId,
      };
    } else {
      sql += ' ORDER BY create_time DESC LIMIT :offset, :limit;';
    }
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      ...params,
    });
    for (let i = 0; i < result.length; i++) {
      if (result[i].sold_token_id === 0) {
        result[i].cny_amount = result[i].sold_amount;
        result[i].token_amount = result[i].bought_amount;
      } else {
        result[i].cny_amount = result[i].bought_amount;
        result[i].token_amount = result[i].sold_amount;
      }
    }
    return result;
  }

  async getLiquidityBalances(tokenId, page = 1, pagesize = 10, sort = 'amount-desc') {
    let orderingColumn, direction;

    switch (sort) {
      case 'amount-desc':
        orderingColumn = 'liquidity_balance';
        direction = 'DESC';
        break;

      case 'amount-asc':
        orderingColumn = 'liquidity_balance';
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

    const sql = `
      SELECT t1.uid, t1.token_id, t1.liquidity_balance, t1.create_time,
        t2.total_supply,
        t3.name, t3.symbol, decimals, t3.logo,
        t4.username, t4.nickname, t4.avatar
      FROM exchange_balances AS t1
      JOIN exchanges AS t2 USING (token_id)
      JOIN minetokens AS t3 ON t1.token_id = t3.id
      JOIN users as t4 ON t1.uid = t4.id
      WHERE token_id = :tokenId
      ORDER BY ${orderingColumn} ${direction}
      LIMIT :offset, :limit;
      SELECT count(1) AS count FROM exchange_balances WHERE token_id = :tokenId;`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      tokenId,
    });

    _.each(result[0], row => {
      row.username = this.service.user.maskEmailAddress(row.username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }

  async getLiquidityTransactions(tokenId, page = 1, pagesize = 10) {
    const sql = `
      SELECT t1.token_id, t1.create_time, t1.liquidity, t1.token_amount, t1.cny_amount,
        t2.from_uid, t2.to_uid, t2.tx_hash,
        u1.username AS from_username, u1.nickname AS from_nickname,u1.avatar AS from_avatar,
        u2.username AS to_username, u2.nickname AS to_nickname,u2.avatar AS to_avatar
      FROM exchange_liquidity_logs t1
      JOIN assets_minetokens_log t2 USING (token_id, create_time)
      JOIN users u1 ON t2.from_uid = u1.id
      JOIN users u2 ON t2.to_uid = u2.id
      WHERE token_id = :tokenId
      ORDER BY create_time DESC
      LIMIT :offset, :limit;
      SELECT count(1) AS count FROM exchange_liquidity_logs WHERE token_id = :tokenId;`;
    const result = await this.app.mysql.query(sql, {
      offset: (page - 1) * pagesize,
      limit: pagesize,
      tokenId,
    });

    _.each(result[0], row => {
      row.from_username = this.service.user.maskEmailAddress(row.from_username);
      row.to_username = this.service.user.maskEmailAddress(row.to_username);
    });

    return {
      count: result[1][0].count,
      list: result[0],
    };
  }
  async getRelated(tokenId, filter = 0, sort = 'popular-desc', page = 1, pagesize = 10) {
    if (tokenId === null) {
      return false;
    }

    if (typeof filter === 'string') filter = parseInt(filter);
    if (typeof page === 'string') page = parseInt(page);
    if (typeof pagesize === 'string') pagesize = parseInt(pagesize);

    let sql = 'SELECT m.sign_id AS id FROM post_minetokens m JOIN posts p ON p.id = m.sign_id WHERE token_id = :tokenId ';
    let countSql = 'SELECT count(1) AS count FROM post_minetokens m JOIN posts p ON p.id = m.sign_id WHERE token_id = :tokenId ';

    if (filter === 1) {
      sql += 'AND require_buy = 0 ';
      countSql += 'AND require_buy = 0;';
    } else if (filter === 2) {
      sql += 'AND require_buy = 1 ';
      countSql += 'AND require_buy = 1;';
    }

    switch (sort) {
      case 'popular-desc':
        sql += 'ORDER BY p.hot_score DESC, p.id DESC ';
        break;

      case 'time-desc':
        sql += 'ORDER BY p.create_time DESC ';
        break;

      default:
        return false;
    }

    sql += 'LIMIT :start, :end;';

    const results = await this.app.mysql.query(sql + countSql, {
      tokenId,
      start: (page - 1) * pagesize,
      end: 1 * pagesize,
    });

    return {
      count: results[1][0].count,
      list: await this.service.post.getByPostIds(results[0].map(row => row.id)),
    };
  }
  async getRelatedWithOnlyCreator(tokenId, filter = 0, sort = 'popular-desc', page = 1, pagesize = 10, onlyCreator = false, channel_id = 1) {
    if (tokenId === null) {
      return false;
    }

    if (typeof filter === 'string') filter = parseInt(filter);
    if (typeof page === 'string') page = parseInt(page);
    if (typeof pagesize === 'string') pagesize = parseInt(pagesize);

    let sql = `
      SELECT p.*
      FROM posts p
      LEFT JOIN post_minetokens m
      ON p.id = m.sign_id
      WHERE ((uid = (
        SELECT uid FROM minetokens WHERE id = :tokenId
      ) AND p.require_holdtokens = 0
      ) OR m.token_id = :tokenId) AND channel_id = :channel_id `;
    let countSql = `
      SELECT count(1) as count
      FROM posts p
      LEFT JOIN post_minetokens m
      ON p.id = m.sign_id
      WHERE ((uid = (
        SELECT uid FROM minetokens WHERE id = :tokenId
      ) AND p.require_holdtokens = 0
      ) OR m.token_id = :tokenId) AND channel_id = :channel_id `;

    // let sql = 'SELECT m.sign_id AS id FROM post_minetokens m JOIN posts p ON p.id = m.sign_id WHERE token_id = :tokenId ';
    // let countSql = 'SELECT count(1) AS count FROM post_minetokens m JOIN posts p ON p.id = m.sign_id WHERE token_id = :tokenId ';

    if (filter === 1) {
      sql += 'AND require_buy = 0 ';
      countSql += 'AND require_buy = 0';
    } else if (filter === 2) {
      sql += 'AND require_buy = 1 ';
      countSql += 'AND require_buy = 1';
    }

    const whereTerm = {};
    if (onlyCreator) {
      sql += ' AND p.uid = :uid ';
      countSql += ' AND p.uid = :uid;';
      const { uid } = await this.get(tokenId);
      whereTerm.uid = uid;
    } else {
      countSql += ';';
    }

    switch (sort) {
      case 'popular-desc':
        sql += 'ORDER BY p.hot_score DESC, p.id DESC ';
        break;

      case 'time-desc':
        sql += 'ORDER BY p.create_time DESC ';
        break;

      default:
        return false;
    }

    sql += 'LIMIT :start, :end;';

    this.logger.info('service.token.mineToken.getRelated sql', sql + countSql);

    this.logger.debug(sql);

    const results = await this.app.mysql.query(sql + countSql, {
      tokenId,
      channel_id,
      start: (page - 1) * pagesize,
      end: 1 * pagesize,
      ...whereTerm,
    });

    return {
      count: results[1][0].count,
      list: await this.service.post.getByPostIds(results[0].map(row => row.id)),
    };
  }
  async countMember() {
    const res = await this.app.redis.zrange('token:member', 0, -1, 'WITHSCORES');
    const result = {};
    const len = res.length;
    for (let i = 0; i < len; i += 2) {
      result[res[i]] = res[i + 1];
    }
    return result;
  }
}

module.exports = MineTokenService;
