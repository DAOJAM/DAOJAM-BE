// token 团队设置拥有者

const mysql = require('mysql2/promise');
const config = require('./config.json');
const moment = require('moment');

const init = async () => {
  const conn = await mysql.createPool({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_db,
  });

  // 查询所有的token
  const tokenAllResult = await conn.execute('SELECT id, uid FROM minetokens;');
  const tokenLists = tokenAllResult[0];

  // 清空teams

  // 写入teams
  // 错误列表
  const errorList = [];
  for (let i = 0; i < tokenLists.length; i++) {
    try {
      // 查询有记录
      const sqlSelect = 'SELECT * FROM minetoken_teams WHERE token_id = ? AND uid = ?;';
      const SelectResult = await conn.execute(sqlSelect, [ tokenLists[i].id, tokenLists[i].uid ]);
      if (SelectResult[0].length === 0) {
        // 没有记录 插入
        const sql = `INSERT INTO minetoken_teams (token_id, uid, \`status\`, note, create_time) 
                     VALUES (?, ?, ?, ?, ?);`;
        const result = await conn.execute(sql, [ tokenLists[i].id, tokenLists[i].uid, 1, 'owner', moment().format('YYYY-MM-DD HH:mm:ss') ]);
        if (result[0].affectedRows !== 1) {
          errorList.push(tokenLists[i]);
        }
      } else {
        // 有记录 更新数据
        const sql = `UPDATE minetoken_teams SET token_id = ?, uid = ?, status = ?, note = ?, create_time = ? 
                            WHERE token_id = ? AND uid = ?;`;
        const result = await conn.execute(sql, [ tokenLists[i].id, tokenLists[i].uid, 1, 'owner', moment().format('YYYY-MM-DD HH:mm:ss'), tokenLists[i].id, tokenLists[i].uid ]);
        if (result[0].affectedRows !== 1) {
          errorList.push(tokenLists[i]);
        }
      }
    } catch (e) {
      console.log(e, i);
      errorList.push(tokenLists[i]);
    }
  }
  console.log('error list', errorList);

  // 查询所有的teams
  const teamsAllResult = await conn.execute('SELECT token_id, uid FROM minetoken_teams WHERE note = \'owner\';');

  // teams list
  const teamsLists = teamsAllResult[0];

  // 异常检查
  for (let i = 0; i < teamsLists.length; i++) {
    try {
      const token = teamsLists[i].token_id !== tokenLists[i].id;
      const uid = teamsLists[i].uid !== tokenLists[i].uid;
      if (token || uid) {
        console.log(teamsLists[i], tokenLists[i]);
      }
    } catch (e) {
      console.log(e, teamsLists[i], tokenLists[i]);
    }
  }

  await conn.end();

  process.exitCode = 1;

};

init();
