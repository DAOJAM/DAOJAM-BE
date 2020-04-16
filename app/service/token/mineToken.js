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
  async create(userId, name, symbol, initialSupply, decimals, logo, brief, introduction, txHash, cover, repo) {
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

    const sql = 'INSERT INTO minetokens(uid, name, symbol, decimals, total_supply, create_time, status, logo, brief, introduction, cover, repo) '
      //                      ⬇️⬅️ 故意把 Status 设为 0，合约部署成功了 worker 会把它设置回 1 (active)
      + 'SELECT ?,?,?,?,0,?,0,?,?,?,?,? FROM DUAL WHERE NOT EXISTS(SELECT 1 FROM minetokens WHERE uid=? OR symbol=?);';
    const create_time = moment().format('YYYY-MM-DD HH:mm:ss');
    const result = await this.app.mysql.query(sql,
      [ userId, name, symbol, decimals, create_time, logo, brief, introduction, cover, repo, userId, symbol ]);
    await this.emitIssueEvent(userId, result.insertId, null, txHash);
    await this._mint(result.insertId, userId, initialSupply, null, null);
    // await this.service.tokenCircle.api.addTokenProfile(result.insertId, name, symbol, userId, 'NULL');
    // es里添加新加入的fan票
    await this.service.search.importToken({
      id: result.insertId,
      name,
      symbol,
      brief,
      introduction,
      contract_address: txHash,
    });
    // team 写入拥有者
    await this.setTeamOwner(result.insertId, userId);

    return result.insertId;
  }

  // 设置团队拥有者
  async setTeamOwner(tokenId, uid) {
    const conn = await this.app.mysql.beginTransaction();

    try {
      // 查询
      const sqlSelect = 'SELECT * FROM minetoken_teams WHERE token_id = ? AND uid = ?;';
      const SelectResult = await conn.query(sqlSelect, [ tokenId, uid ]);
      if (SelectResult.length === 0) {
        // 没有记录 插入
        const sql = `INSERT INTO minetoken_teams (token_id, uid, \`status\`, note, create_time) 
                    VALUES (?, ?, ?, ?, ?);`;
        const result = await conn.query(sql, [ tokenId, uid, 1, 'owner', moment().format('YYYY-MM-DD HH:mm:ss') ]);
        await conn.commit();

        if (result.affectedRows === 1) {
          return 0;
        }
        return -1;

      }
      // 有记录 更新数据
      const sql = `UPDATE minetoken_teams SET token_id = ?, uid = ?, status = ?, note = ?, create_time = ? 
                            WHERE token_id = ? AND uid = ?;`;
      const result = await conn.query(sql, [ tokenId, uid, 1, 'owner', moment().format('YYYY-MM-DD HH:mm:ss'), tokenId, uid ]);
      await conn.commit();

      if (result.affectedRows === 1) {
        return 0;
      }
      return -1;


    } catch (e) {
      console.log(e);
      await conn.rollback();
      this.ctx.logger.error(`setTeamOwner error: ${e}`);
    }
  }

  async emitIssueEvent(from_uid, tokenId, ip, transactionHash) {
    // 现在要留存发币后上链结果的hash，以留存证据
    return this.app.mysql.query('INSERT INTO assets_minetokens_log(from_uid, to_uid, token_id, amount, create_time, ip, type, tx_hash) VALUES(?,?,?,?,?,?,?,?);',
      [ from_uid, 0, tokenId, 0, moment().format('YYYY-MM-DD HH:mm:ss'),
        ip, consts.mineTokenTransferTypes.issue, transactionHash,
      ]);
  }

  // 更新粉丝币信息
  async update(userId, tokenId, name, logo, brief, introduction, cover, repo) {
    const row = {};
    row.name = name;
    row.logo = logo;
    row.brief = brief;
    row.introduction = introduction;
    row.cover = cover;
    row.repo = repo;

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

    // Fix a bug because there's no any unit test
    if (token) {
      // Move from this.supporters() based on commit 6167231078f93f3d8af70195c7d3042182b5a74c
      const sqlCount = 'SELECT COUNT(*) AS count FROM (SELECT COUNT(1) AS count FROM daojam_vote_log WHERE pid = ? GROUP BY pid, uid) alias;';
      const countResult = await this.app.mysql.query(sqlCount, [ token.pid ]);

      token.supporter = countResult[0].count || 0;


      // 查询团队成员数量
      const sqlTeams = 'SELECT COUNT(1) AS members FROM (SELECT * FROM minetoken_teams WHERE token_id = ? AND `status` = 1) AS a';
      const resultTeams = await this.app.mysql.query(sqlTeams, [ token.id ]);
      token.members = resultTeams[0].members;

    }

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


  // 获取lives
  async getLives(tokenId, page = 1, pagesize = 20, order = '') {
    const conn = await this.app.mysql.beginTransaction();
    try {
      let result = null;
      if (typeof page === 'string') page = parseInt(page);
      if (typeof pagesize === 'string') pagesize = parseInt(pagesize);
      // 如果 -1 说明要查全部数据
      let sql = `SELECT u.nickname, u.username, u.avatar, m.id, m.uid, m.title, m.content, m.create_time 
          FROM users u, minetoken_lives m 
          WHERE m.token_id = ? AND u.id = m.uid`;

      // oder by DESC/ASC 其他参数不允许传递
      if (order === 'desc' || order === 'asc') {
        sql += ` ORDER BY m.create_time ${order.toUpperCase()}`;
      }

      if (pagesize === -1) {
        sql += ';';
        result = await conn.query(sql, [ tokenId ]);
      } else {
        // 前面有空格
        sql += ' LIMIT ?, ?;';
        result = await conn.query(sql, [ tokenId, (page - 1) * pagesize, pagesize ]);
      }

      // 统计 count
      const countResult = await conn.query('SELECT COUNT(1) AS count FROM minetoken_lives WHERE token_id = ?;', [ tokenId ]);
      await conn.commit();
      return {
        count: countResult[0].count || 0,
        list: result,
      };
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -1;
    }
  }
  // 创建 live
  async createLive(userId, tokenId, live) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return {
        code: -1,
      };
    }

    try {
      // 创建一条live
      const insertResult = await this.app.mysql.insert('minetoken_lives', {
        token_id: tokenId,
        uid: live.uid,
        title: live.title,
        content: live.content,
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });
      // 返回 id
      return {
        code: 0,
        data: {
          id: insertResult.insertId,
        },
      };
    } catch (e) {
      this.ctx.logger.error(`createLive error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 更新 live
  async updateLive(userId, tokenId, live) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    try {
      // 更新一条live
      const updateResult = await this.app.mysql.update('minetoken_lives', {
        id: live.id,
        token_id: tokenId,
        uid: live.uid,
        title: live.title,
        content: live.content,
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      // 判断是否更新成功
      if (updateResult.affectedRows === 1) {
        return 0;
      }
      return -1;


    } catch (e) {
      this.ctx.logger.error(`updateLive error: ${e}`);
      return -1;
    }
  }
  // 删除 live
  async deleteLive(userId, tokenId, live) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    try {
      await this.app.mysql.delete('minetoken_lives', {
        id: live.id,
      });
      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }

  // 获取news
  async getNews(tokenId, page = 1, pagesize = 20, order = '') {
    const conn = await this.app.mysql.beginTransaction();
    try {
      let result = null;
      if (typeof page === 'string') page = parseInt(page);
      if (typeof pagesize === 'string') pagesize = parseInt(pagesize);
      // 如果 -1 说明要查全部数据
      let sql = `SELECT m.id, m.title, m.content, m.create_time 
        FROM minetoken_news m 
        WHERE m.token_id = ?`;

      // oder by DESC/ASC 其他参数不允许传递
      if (order === 'desc' || order === 'asc') {
        sql += ` ORDER BY m.create_time ${order.toUpperCase()}`;
      }

      if (pagesize === -1) {
        sql += ';';
        result = await conn.query(sql, [ tokenId ]);
      } else {
        // 前面有空格
        sql += ' LIMIT ?, ?;';
        result = await conn.query(sql, [ tokenId, (page - 1) * pagesize, pagesize ]);
      }
      // 统计 count
      const countResult = await conn.query('SELECT COUNT(1) AS count FROM minetoken_news WHERE token_id = ?;', [ tokenId ]);
      await conn.commit();
      return {
        count: countResult[0].count || 0,
        list: result,
      };
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -1;
    }
  }
  // 创建 news
  async createNew(userId, tokenId, news) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return {
        code: -1,
      };
    }

    try {
      // 创建一条live
      const insertResult = await this.app.mysql.insert('minetoken_news', {
        token_id: tokenId,
        title: news.title,
        content: news.content,
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });
      // 返回 id
      return {
        code: 0,
        data: {
          id: insertResult.insertId,
        },
      };
    } catch (e) {
      this.ctx.logger.error(`createNew error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 更新 news
  async updateNew(userId, tokenId, news) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    try {
      // 更新一条live
      const updateResult = await this.app.mysql.update('minetoken_news', {
        id: news.id,
        token_id: tokenId,
        title: news.title,
        content: news.content,
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      // 判断是否更新成功
      if (updateResult.affectedRows === 1) {
        return 0;
      }
      return -1;


    } catch (e) {
      this.ctx.logger.error(`updateNew error: ${e}`);
      return -1;
    }
  }
  // 删除 news
  async deleteNew(userId, tokenId, news) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    try {
      await this.app.mysql.delete('minetoken_news', {
        id: news.id,
      });
      return 0;
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }

  async imageList(tokenId) {
    try {
      const { pid } = await this.get(tokenId);
      tokenId = pid;

      return await this.app.mysql.select('minetoken_images', {
        where: { pid: tokenId },
        columns: [ 'url' ],
      });
    } catch (e) {
      this.ctx.logger.error(e);
      return [];
    }
  }

  async postImages(userId, tokenId, images) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      const { pid } = await this.get(tokenId);
      tokenId = pid;

      const result = await conn.select('minetoken_images', {
        pid: tokenId,
      });
      // 如果有记录 全部删除
      if (result) {
        await conn.delete('minetoken_images', {
          pid: tokenId,
        });
      }

      for (const key of images) {
        // 然后插入新数据
        await conn.insert('minetoken_images', {
          pid: tokenId,
          url: key,
          create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        });
      }
      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -1;
    }
  }

  async rank(tokenId) {
    try {
      const { pid } = await this.get(tokenId);
      tokenId = pid;
      // sql写得有点复杂需要慢慢看
      // 1.先查询所有记录并排序
      // 2.根据所有记录增加ranks
      // 3.根据uid查询ranks得数据
      const sql = `SELECT a.ranks FROM
      (SELECT @rank := @rank+1 AS ranks, d.*
      FROM
      (SELECT @rank := 0) r,
      (SELECT d.pid, d.uid, SUM(d.weight) AS weight, SUM(POW(d.weight,2)) AS daot
      FROM daojam_vote_log d
      GROUP BY pid ORDER BY weight DESC, daot DESC) AS d) AS a WHERE pid = ?;`;
      const result = await this.app.mysql.query(sql, [ tokenId ]);
      if (result) {
        return result[0].ranks;
      }
      return 0;

    } catch (e) {
      this.ctx.logger.error(e);
      return 0;
    }
  }


  async milestone(tokenId) {
    try {
      const { pid } = await this.get(tokenId);

      return await this.app.mysql.select('minetoken_milestones', {
        where: { pid },
      });
    } catch (e) {
      this.ctx.logger.error(e);
      return [];
    }
  }

  async postMilestones(userId, tokenId, milestones) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return -1;
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      const { pid } = await this.get(tokenId);
      tokenId = pid;

      const result = await conn.select('minetoken_milestones', {
        pid: tokenId,
      });
      // 如果有记录 全部删除
      if (result) {
        await conn.delete('minetoken_milestones', {
          pid: tokenId,
        });
      }

      for (const key of milestones) {
        // 然后插入新数据
        await conn.insert('minetoken_milestones', {
          pid: tokenId,
          label: key.label,
          status: key.status,
          create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        });
      }
      await conn.commit();
      return 0;
    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(e);
      return -1;
    }
  }


  // ---------- 投票记录 --------------
  async supporters(tokenId, page = 1, pagesize = 20) {
    try {
      const { pid, supporter } = await this.get(tokenId);
      tokenId = pid;

      let result = null;
      if (typeof page === 'string') page = parseInt(page);
      if (typeof pagesize === 'string') pagesize = parseInt(pagesize);

      const sql = `SELECT d.uid, SUM(d.weight) as weight, u.avatar, u.nickname, u.username
                FROM daojam_vote_log d, users u
                WHERE d.pid = ? AND d.uid = u.id
                GROUP BY pid, uid
                ORDER BY weight DESC LIMIT ?, ?;`;

      result = await this.app.mysql.query(sql, [ tokenId, (page - 1) * pagesize, pagesize ]);

      for (let i = 0; i < result.length; i++) {
        const sql = 'SELECT create_time, weight FROM daojam_vote_log WHERE pid = ? AND uid = ?;';
        const resultList = await this.app.mysql.query(sql, [ pid, result[i].uid ]);
        result[i].data = resultList;
      }

      return {
        count: supporter,
        list: result,
      };
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }
  async votes(tokenId, page = 1, pagesize = 20) {
    try {
      const { pid } = await this.get(tokenId);
      tokenId = pid;

      let result = null;
      if (typeof page === 'string') page = parseInt(page);
      if (typeof pagesize === 'string') pagesize = parseInt(pagesize);

      const sql = `SELECT d.uid, d.weight, d.create_time, d.trx, u.avatar, u.nickname, u.username 
                FROM daojam_vote_log d, users u WHERE pid = ? AND d.uid = u.id
                ORDER BY d.create_time DESC LIMIT ?, ?;`;

      result = await this.app.mysql.query(sql, [ tokenId, (page - 1) * pagesize, pagesize ]);

      // 统计 count
      const countResult = await this.app.mysql.query('SELECT COUNT(1) AS count FROM daojam_vote_log WHERE pid = ?;', [ tokenId ]);
      return {
        count: countResult[0].count || 0,
        list: result,
      };
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }
  async charts(tokenId, page = 1, pagesize = 20) {
    try {
      const { pid } = await this.get(tokenId);
      tokenId = pid;

      if (typeof page === 'string') page = parseInt(page);
      if (typeof pagesize === 'string') pagesize = parseInt(pagesize);

      // 一天
      const daySql = `SELECT DATE_FORMAT(create_time,'%H:00:00') AS create_time, SUM(weight) as weight
                    FROM daojam_vote_log 
                    WHERE pid = ? AND create_time >= (NOW() - INTERVAL 24 HOUR) 
                    GROUP BY HOUR(create_time) ORDER BY HOUR(create_time);`;

      const dayResult = await this.app.mysql.query(daySql, [ tokenId ]);

      // 一周
      const weekSql = `SELECT DATE_FORMAT(create_time,'%Y-%m-%d') as create_time, SUM(weight) as weight FROM daojam_vote_log 
                    WHERE pid = ? AND DATE_SUB(NOW(),INTERVAL 7 DAY) <= DATE(create_time) 
                    GROUP BY DATE_FORMAT(create_time,'%Y-%m-%d') 
                    ORDER BY create_time ASC;`;

      const weekResult = await this.app.mysql.query(weekSql, [ tokenId ]);

      // 格式话一天的时间
      const day = [];
      const dayList = [];
      for (let i = 0; i < 24; i++) {
        if (i < 10) {
          day.push(`0${i}:00:00`);
        } else {
          day.push(`${i}:00:00`);
        }
      }

      for (let i = 0; i < day.length; i++) {
        const result = dayResult.filter(item => item.create_time === day[i]);
        if (result.length >= 1) {
          dayList.push({
            create_time: day[i],
            weight: result[0].weight,
          });
        } else {
          dayList.push({
            create_time: day[i],
            weight: 0,
          });
        }
      }

      // 格式化一周的时间
      const week = [];
      const weekList = [];
      for (let i = 6; i >= 0; i--) {
        const dayCalendar = moment().subtract(i, 'days');
        const day = moment(dayCalendar).format('YYYY-MM-DD');
        week.push(day);
      }

      for (let i = 0; i < week.length; i++) {
        const result = weekResult.filter(item => item.create_time === week[i]);
        if (result.length >= 1) {
          weekList.push({
            create_time: week[i],
            weight: result[0].weight,
          });
        } else {
          weekList.push({
            create_time: week[i],
            weight: 0,
          });
        }
      }

      return {
        day: dayList,
        week: weekList,
      };
    } catch (e) {
      this.ctx.logger.error(e);
      return -1;
    }
  }


  // --------------- 团队管理 ------------------
  // 邀请队员
  async teamMemberInvite(userId, tokenId, teamMember) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return {
        code: -1,
      };
    }
    if (token && token.uid === teamMember.uid) {
      return {
        code: -1,
        message: '不能邀请自己',
      };
    }

    const conn = await this.app.mysql.beginTransaction();

    // 发送邀请
    const sendInvite = () => {
      // TODO 邀请操作
      console.log('send invite');
      if (true) {
        return {
          code: 0,
          message: '邀请成功',
        };
      }
      throw new Error('send Invite error');

    };

    // 没有同意加入团队 继续发送请求并且更新数据
    const sendInviteAndUpdateDate = async () => {
      const updateRow = {
        note: 'invite', // 覆盖来源
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        contact: '',
        content: '',
      };
      const updateOptions = {
        where: {
          token_id: tokenId,
          uid: teamMember.uid,
        },
      };
      const updateResult = await conn.update('minetoken_teams', updateRow, updateOptions);

      await conn.commit();

      // 更新时间成功
      if (updateResult.affectedRows === 1) {
        console.log('更新邀请信息');
        return sendInvite();
      }
      throw new Error('update note create_time error');

    };

    // 如果没有记录
    const sendFirstInvite = async () => {
      const insertResult = await conn.insert('minetoken_teams', {
        token_id: tokenId,
        uid: teamMember.uid,
        status: 0,
        note: 'invite',
        contact: '',
        content: '',
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });
      await conn.commit();

      // 写入成功
      if (insertResult.affectedRows === 1) {
        console.log('第一次邀请');
        return sendInvite();
      }
      throw new Error(`invite inset error: ${insertResult}`);

    };

    try {
      // 查询是否已经邀请过了
      const result = await conn.get('minetoken_teams', {
        token_id: tokenId,
        uid: teamMember.uid,
      });

      // 查询是否已有数据
      if (result) {
        // 有记录 查看状态
        if (result.status === 0) {
          // 还没有同意
          return sendInviteAndUpdateDate();
        } else if (result.status === 1) {
          // 已经同意了
          return {
            code: -1,
            message: '已经是团队成员了',
          };
        }
        // 其他 status 不等于 1 0
        this.ctx.logger.error(`status error ${result.status}`);
        return {
          code: -1,
          message: '邀请失败',
        };

      }
      // 没有记录
      return sendFirstInvite();


    } catch (e) {
      console.log(e);
      await conn.rollback();
      this.ctx.logger.error(`teamMemberInvite error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 申请加入
  async teamMemberApply(userId, tokenId, teamMember) {
    // 不能申请加入自己的团队 如果自己有token token 的 id 不能等于 tokenId
    const token = await this.getByUserId(userId);
    if (token && token.id === tokenId) {
      return {
        code: -1,
        message: '不能申请加入自己的团队',
      };
    }

    const conn = await this.app.mysql.beginTransaction();

    // 发送申请
    const sendApply = () => {
      // TODO 申请操作
      console.log('send apply');
      if (true) {
        return {
          code: 0,
          message: '申请成功',
        };
      }
      throw new Error('send apply error');

    };

    // 没有同意加入团队 继续发送请求并且更新数据
    const sendApplyAndUpdateDate = async () => {
      const updateRow = {
        note: 'apply', // 覆盖来源
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
        contact: teamMember.contact,
        content: teamMember.content,
      };
      const updateOptions = {
        where: {
          token_id: tokenId,
          uid: teamMember.uid,
        },
      };
      const updateResult = await conn.update('minetoken_teams', updateRow, updateOptions);

      await conn.commit();

      // 更新时间成功
      if (updateResult.affectedRows === 1) {
        console.log('更新申请信息');
        return sendApply();
      }
      throw new Error('update note create_time error');

    };

    // 如果没有记录
    const sendFirstApply = async () => {
      const insertResult = await conn.insert('minetoken_teams', {
        token_id: tokenId,
        uid: teamMember.uid,
        status: 0,
        note: 'apply',
        contact: teamMember.contact,
        content: teamMember.content,
        create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      });
      await conn.commit();

      // 写入成功
      if (insertResult.affectedRows === 1) {
        console.log('第一次申请');
        return sendApply();
      }
      throw new Error(`apply inset error: ${insertResult}`);

    };

    try {
      // 查询是否已经邀申请过了
      const result = await conn.get('minetoken_teams', {
        token_id: tokenId,
        uid: teamMember.uid,
      });

      // 查询是否已有数据
      if (result) {
        // 有记录 查看状态
        if (result.status === 0) {
          // 还没有同意
          return sendApplyAndUpdateDate();
        } else if (result.status === 1) {
          // 已经同意了
          return {
            code: -1,
            message: '已经是团队成员了',
          };
        }
        // 其他 status 不等于 1 0
        this.ctx.logger.error(`status error ${result.status}`);
        return {
          code: -1,
          message: '申请失败',
        };

      }
      // 没有记录
      return sendFirstApply();


    } catch (e) {
      console.log(e);
      await conn.rollback();
      this.ctx.logger.error(`teamMemberApply error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 同意加入 申请同意 (管理员同意的角度）
  async teamMemberApplySuccess(userId, tokenId, teamMember) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return {
        code: -1,
      };
    }

    // 同意加入团队
    const successJoin = async () => {
      const updateRow = {
        status: 1,
      };
      const updateOptions = {
        where: {
          token_id: tokenId,
          uid: teamMember.uid,
          note: 'apply', // 只负责相应的修改
        },
      };
      const updateResult = await this.app.mysql.update('minetoken_teams', updateRow, updateOptions);

      if (updateResult.affectedRows === 1) {
        return {
          code: 0,
        };
      }
      throw new Error('successJoin error');

    };

    try {
      // 查询记录
      const result = await this.app.mysql.get('minetoken_teams', {
        token_id: tokenId,
        uid: teamMember.uid,
        note: 'apply', // 只负责相应的修改
      });

      if (result) {
        if (result.status === 0) {
          return successJoin();
        } else if (result.status === 1) {
          return {
            code: 0,
            message: '已经是团队成员了',
          };
        }
        // 其他 status 不等于 1 0
        this.ctx.logger.error(`status error ${result.status}`);
        return {
          code: -1,
          message: '同意失败',
        };

      }
      return {
        code: -1,
        message: '没有这条记录',
      };


    } catch (e) {
      console.log(e);
      this.ctx.logger.error(`teamMemberInvite error: ${e}`);
      return {
        code: -1,
      };
    }

  }
  /**
   * 同意加入 邀请同意 (用户同意的角度)
   * @param userId { number | string }
   * @param tokenId { number | string }
   * @param teamMember { object } { invite_id: 邀请人的id }
   * @return {Promise<{code: number}|undefined|{code: number, message: string}>}
   */
  async teamMemberInviteSuccess(userId, tokenId, teamMember) {

    // token_id invite_id user_id

    // 查询token user_id note
    // 判断token是邀请人所有
    const token = await this.getByUserId(teamMember.invite_id);
    if (token.id !== tokenId) {
      return {
        code: -1,
      };
    }

    // 同意加入团队
    const successJoin = async () => {
      const updateRow = {
        status: 1,
      };
      const updateOptions = {
        where: {
          token_id: tokenId,
          uid: userId,
          note: 'invite', // 只负责相应的修改
        },
      };
      const updateResult = await this.app.mysql.update('minetoken_teams', updateRow, updateOptions);

      if (updateResult.affectedRows === 1) {
        return {
          code: 0,
          message: '接受邀请',
        };
      }
      throw new Error('successJoin error');

    };

    try {
      // 查询记录
      const result = await this.app.mysql.get('minetoken_teams', {
        token_id: tokenId,
        uid: userId,
        note: 'invite', // 只负责相应的修改
      });

      if (result) {
        if (result.status === 0) {
          return successJoin();
        } else if (result.status === 1) {
          return {
            code: 0,
            message: '已经是团队成员了',
          };
        }
        // 其他 status 不等于 1 0
        this.ctx.logger.error(`status error ${result.status}`);
        return {
          code: -1,
          message: '同意失败',
        };

      }
      return {
        code: -1,
        message: '您不是邀请对象',
      };


    } catch (e) {
      console.log(e);
      this.ctx.logger.error(`teamMemberInviteSuccess error: ${e}`);
      return {
        code: -1,
      };
    }

  }
  // 删除队员 (管理删除 邀请删除 申请删除)
  async teamMemberRemove(userId, tokenId, teamMember) {
    const token = await this.getByUserId(userId);
    if (token.id !== tokenId) {
      return {
        code: -1,
      };
    }

    if (token && token.uid === teamMember.uid) {
      return {
        code: -1,
        message: '不能删除自己',
      };
    }

    const conn = await this.app.mysql.beginTransaction();
    try {
      // 查询数据
      const getResult = await conn.get('minetoken_teams', {
        token_id: tokenId,
        uid: teamMember.uid,
      });

      if (getResult) {
        // 试图删除管理
        if (getResult.note === 'owner') {
          await conn.commit();
          return {
            code: -1,
            message: '不能删除拥有者',
          };
        } else if (getResult.note === teamMember.note) {
          // 邀请删除 申请删除
          // teamMember.note 的作用是增加删除条件 防止删串
          await conn.delete('minetoken_teams', {
            token_id: tokenId,
            uid: teamMember.uid,
            note: teamMember.note,
          });
          await conn.commit();
          return {
            code: 0,
          };
        }
        await conn.commit();
        return {
          code: -1,
          message: '删除失败',
        };

      }
      await conn.commit();
      return {
        code: -1,
      };


    } catch (e) {
      await conn.rollback();
      this.ctx.logger.error(`teamMemberRemove error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 获取所有成员
  // 没有做分页 原因1：人数不会很多 2：觉得一下全部展示会更好 3：开源的的贡献者列表一般都是全部展示
  async teamMember(tokenId, note = '') {
    try {
      let sql = '';
      let countSql = '';
      let sqlParams = [];
      let countSqlParams = [];
      if (note === 'apply') {
        // 申请列表
        sql = `SELECT m.uid, m.note, m.contact, m.content, m.create_time, u.nickname, u.username, u.avatar
                  FROM minetoken_teams m, users u 
                  WHERE m.token_id = ? AND m.status = ? AND m.note = ? AND u.id = m.uid;`;
        sqlParams = [ tokenId, 0, 'apply' ];

        countSql = 'SELECT COUNT(1) as count FROM minetoken_teams WHERE token_id = ? AND `status` = ? AND note = ?;';
        countSqlParams = [ tokenId, 0, 'apply' ];
      } else if (note === 'invite') {
        // 邀请列表
        sql = `SELECT m.uid, m.note, m.create_time, u.nickname, u.username, u.avatar
                  FROM minetoken_teams m, users u 
                  WHERE m.token_id = ? AND m.status = ? AND m.note = ? AND u.id = m.uid;`;
        sqlParams = [ tokenId, 0, 'invite' ];

        countSql = 'SELECT COUNT(1) as count FROM minetoken_teams WHERE token_id = ? AND `status` = ? AND note = ?;';
        countSqlParams = [ tokenId, 0, 'invite' ];

      } else {
        // 成员列表
        sql = `SELECT m.uid, m.note, u.nickname, u.username, u.avatar
              FROM minetoken_teams m, users u 
              WHERE m.token_id = ? AND m.status = ? AND u.id = m.uid ORDER BY FIELD(note,'owner', 'apply', 'invite') ASC;;`;
        sqlParams = [ tokenId, 1 ];

        countSql = 'SELECT COUNT(1) as count FROM minetoken_teams WHERE token_id = ? AND `status` = 1;';
        countSqlParams = [ tokenId ];
      }
      // 查询列表
      const selectResult = await this.app.mysql.query(sql, sqlParams);

      // 统计 count
      const countResult = await this.app.mysql.query(countSql, countSqlParams);

      return {
        code: 0,
        data: {
          count: countResult[0].count || 0,
          list: selectResult,
        },
      };

    } catch (e) {
      this.ctx.logger.error(`teamMember error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 邀请列表（被邀请人的列表）
  async teamMemberInviteList(userId) {
    try {
      // 邀请列表
      const sql = `SELECT m.token_id, m.create_time, m.uid, t.logo, t.symbol, t.name
                    FROM minetoken_teams m, minetokens t
                    WHERE m.uid = ? AND m.status = ? AND m.note = ? AND m.token_id = t.id;`;
      const sqlParams = [ userId, 0, 'invite' ];

      const countSql = 'SELECT COUNT(1) as count FROM minetoken_teams WHERE uid = ? AND status = ? AND note = ?;';
      const countSqlParams = [ userId, 0, 'invite' ];

      // 查询列表
      const selectResult = await this.app.mysql.query(sql, sqlParams);

      // 统计 count
      const countResult = await this.app.mysql.query(countSql, countSqlParams);

      return {
        code: 0,
        data: {
          count: countResult[0].count || 0,
          list: selectResult,
        },
      };
    } catch (e) {
      this.ctx.logger.error(`teamMemberInviteList error: ${e}`);
      return {
        code: -1,
      };
    }
  }
  // 邀请同意或删除（被邀请人的操作）
  async teamMemberInviteUser(userId, teamMember) {
    if (userId !== Number(teamMember.uid)) {
      return {
        code: -1,
      };
    }

    try {
      if (teamMember.from === 'accept') {
        const updateRow = {
          status: 1,
        };
        const updateOptions = {
          where: {
            token_id: teamMember.token_id,
            uid: teamMember.uid,
            note: 'invite', // 只负责相应的修改
          },
        };
        console.log(updateOptions);

        const updateResult = await this.app.mysql.update('minetoken_teams', updateRow, updateOptions);

        if (updateResult.affectedRows === 1) {
          return {
            code: 0,
          };
        }
        return {
          code: -1,
        };

      } else if (teamMember.from === 'deny') {
        this.app.mysql.delete('minetoken_teams', {
          token_id: teamMember.token_id,
          uid: teamMember.uid,
          status: 0,
          note: 'invite',
        });

        return {
          code: 0,
        };
      }
      return {
        code: -1,
      };


    } catch (e) {
      this.ctx.logger.error(`teamMember error: ${e}`);
      return {
        code: -1,
      };
    }
  }

  // 获取用户参加的项目列表， status: 0 申请中 \ 1 已加入
  async joinedTeamList(userId, page = 1, pagesize = 20, status = 1) {
    try {
      if (isNaN(userId)) return false;

      const sql = `
      SELECT t1.*, SUM(t2.weight) as weight, SUM(POW(t2.weight,2)) as daot FROM minetokens t1
      LEFT JOIN daojam_vote_log t2
      ON t1.pid = t2.pid
      JOIN minetoken_teams b ON b.token_id = t1.id AND b.uid = :userId AND b.status = :status
      GROUP BY pid
      LIMIT :offset, :limit;
      SELECT count(1) as count FROM minetokens c1
      JOIN minetoken_teams b ON b.token_id = c1.id AND b.uid = :userId AND b.status = :status`;
      const result = await this.app.mysql.query(sql, {
        offset: (page - 1) * pagesize,
        limit: pagesize,
        userId,
        status,
      });

      // 查询团队成员数量
      const list = result[0];
      if (result) {
        for (let i = 0; i < list.length; i++) {
          const sql = 'SELECT COUNT(1) AS members FROM (SELECT * FROM minetoken_teams WHERE token_id = ? AND `status` = 1) AS a';
          const resultTeams = await this.app.mysql.query(sql, [ list[i].id ]);
          list[i].members = resultTeams[0].members;
        }
      }

      return {
        count: result[1][0].count,
        list,
      };
    } catch (e) {
      this.logger.error(0);
      return {
        count: 0,
        list: [],
      };
    }
  }

  // --------------- 团队管理 end ------------------


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

  async getBookmarkStatus(userId, tokenId) {
    const res = await this.app.mysql.get('minetoken_bookmarks', {
      uid: userId,
      token_id: tokenId,
    });
    return res;
  }

  async addBookmark(userId, tokenId) {
    const { existence } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM minetokens WHERE id = ?) existence;', [ tokenId ]))[0];
    if (!existence) {
      return null;
    }

    const { affectedRows } = await this.app.mysql.query('INSERT IGNORE minetoken_bookmarks VALUES(?, ?, ?);', [ userId, tokenId, moment().format('YYYY-MM-DD HH:mm:ss') ]);

    return affectedRows === 1;
  }

  async removeBookmark(userId, tokenId) {
    const { existence } = (await this.app.mysql.query('SELECT EXISTS (SELECT 1 FROM minetokens WHERE id = ?) existence;', [ tokenId ]))[0];
    if (!existence) {
      return null;
    }

    const { affectedRows } = await this.app.mysql.delete('minetoken_bookmarks', {
      uid: userId,
      token_id: tokenId,
    });

    return affectedRows === 1;
  }

  async getBookmarkByTokenIds(userId, tokenIds = []) {
    if (tokenIds === null || tokenIds.length <= 0) {
      return [];
    }
    const sql = `SELECT * FROM minetoken_bookmarks
      WHERE uid = :userId AND token_id IN (:tokenIds)
      ORDER BY FIELD(token_id, :tokenIds)`;

    const list = await this.app.mysql.query(
      sql,
      {
        userId,
        tokenIds,
      }
    );
    return list;
  }
}

module.exports = MineTokenService;
