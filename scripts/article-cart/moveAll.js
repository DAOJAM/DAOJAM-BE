// Automatic short_content generator
// ...
// 使用nodejs环境debug本script即可

const axios = require('axios');
const mysql = require('mysql2/promise');
const config = require('./config.json');
const elastic = require('@elastic/elasticsearch');
const removemd = require('remove-markdown');
// const striptags = require('striptags');

async function catcher() {
  let articleDetailQuery = null;
  let articleRawContent = null;
  let currentId = null;
  let currentHash = null;
  let elaQuery = null;
  let articleUpdate = null;
  let parsedContent = null;
  let parsedTime = null;
  // 创建MySQL连接
  const mysqlConnection = await mysql.createPool({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_db,
    ssl: {},
  });
  // 创建Elastic连接
  const elaClient = new elastic.Client({ node: 'http://localhost:9200' });

  const articleCountQuery = await mysqlConnection.execute(
    'SELECT COUNT(*) AS count FROM posts;'
  );

  console.log(`There are ${articleCountQuery[0][0].count} articles here...`);

  for (let index = 0; index < articleCountQuery[0][0].count; index += 1) {
    // 在某篇文章处卡断推出， 请重启脚本
    articleDetailQuery = await mysqlConnection.execute(
      'SELECT p.id, p.hash, p.username, p.title, p.create_time, u.nickname FROM posts p LEFT JOIN users u ON p.uid = u.id ORDER BY id DESC LIMIT ?, 1;',
      [ index ]
    );
    currentId = articleDetailQuery[0][0].id;
    currentHash = articleDetailQuery[0][0].hash;
    // 文章没有ipfs哈希， 则掠过， 不会退出
    if (!currentHash) {
      console.log(`Current article id ${currentId} do not have content!`);
      continue;
    }
    console.log(`Current article id ${currentId} hash ${currentHash}`);

    // 取内容失败， 多数是无效的ipfs哈希引起， 会掠过， 不会退出
    try {
      articleRawContent = await axios({
        url: `https://api.smartsignature.io/ipfs/catJSON/${currentHash}`,
        method: 'get',
        timeout: 4000,
      });
    } catch (e) {
      console.log(`Current article id ${currentId} has a broken hash... ignored...`);
      console.log(e);
      continue;
    }

    // ipfs获取出错， 可能为其中没有实际文本内容， 会掠过， 不会退出
    if (articleRawContent.data.code !== 200) {
      console.log(`Current article id ${currentId} wrong content structure... ignored...`);
      continue;
    }

    parsedContent = await wash(articleRawContent.data.data.content);
    console.log(parsedContent.substring(0, 100));

    // 更新文章short_content失败， 请重启脚本
    articleUpdate = await mysqlConnection.execute(
      'UPDATE posts SET short_content = ? WHERE id = ?;',
      [ parsedContent, currentId ]
    );

    // 文章是否已经添加入Elastic数据库， 已经添加则会跳过
    elaQuery = await elaClient.search({
      index: 'posts',
      q: `inner_id:${currentId}`,
    });
    if (elaQuery.body.hits.hits.length !== 0) {
      console.log(`Current article id ${currentId} already added...`);
      continue;
    }

    parsedContent = await wash_not_cut(articleRawContent.data.data.content);
    console.log(parsedContent.substring(0, 100));
    parsedTime = Date.parse(currentHash = articleDetailQuery[0][0].create_time);
    console.log(parsedTime);

    await elaClient.index({
      index: 'posts',
      body: {
        inner_id: currentId,
        username: articleDetailQuery[0][0].username,
        nickname: articleDetailQuery[0][0].nickname,
        title: articleDetailQuery[0][0].title,
        content: parsedContent,
        create_time: parsedTime,
      },
    });
  }
}

// 洗去内容的md和html标签， 还有空格和换行等不显示字符
async function wash(rawContent) {
  let parsedContent = rawContent;
  // 去除markdown图片链接
  parsedContent = parsedContent.replace(/!\[.*?\]\((.*?)\)/gi, '');
  // 去除video标签
  parsedContent = parsedContent.replace(/<video.*?>\n*?.*?\n*?<\/video>/gi, '');
  parsedContent = parsedContent.replace(/<[^>]+>/gi, '');
  // parsedContent = parsedContent.replace(/<iframe.*?>.*?<\/iframe>/gi, '');
  parsedContent = parsedContent.substring(0, 600);
  // 去除markdown和html
  parsedContent = removemd(parsedContent);
  // 去除空格
  parsedContent = parsedContent.replace(/\s+/g, '');
  parsedContent = parsedContent.substring(0, 300);
  return parsedContent;
}

// 洗去， 但是不截短， 为elastic使用
async function wash_not_cut(rawContent) {
  let parsedContent = rawContent;
  // 去除markdown图片链接
  parsedContent = parsedContent.replace(/!\[.*?\]\((.*?)\)/gi, '');
  // 去除video标签
  parsedContent = parsedContent.replace(/<video.*?>\n*?.*?\n*?<\/video>/gi, '');
  parsedContent = parsedContent.replace(/<[^>]+>/gi, '');
  // parsedContent = parsedContent.replace(/<iframe.*?>.*?<\/frame>/gi, '');
  // 去除markdown和html
  parsedContent = removemd(parsedContent);
  // 去除空格
  parsedContent = parsedContent.replace(/\s+/g, '');
  return parsedContent;
}

catcher();
