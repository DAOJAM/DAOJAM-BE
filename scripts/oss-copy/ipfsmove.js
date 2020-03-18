const config = require('./config.json');
const mysql = require('mysql2/promise');
const downloader = require('image-downloader');
const filetype = require('file-type');
const moment = require('moment');
const OSS = require('ali-oss');
const fs = require('fs');
const md5 = require('crypto-js/md5');
const sha256 = require('crypto-js/sha256');
const base64 = require('base-64');

const ossClient = OSS({
  region: config.oss_region,
  accessKeyId: config.oss_key,
  accessKeySecret: config.oss_secret,
  bucket: config.oss_bucket,
});

async function moveCover() {

  const mysqlConn = await mysql.createConnection({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_database,
    ssl: {},
  });

  let postInfo;
  let imageFile;
  let fileext;
  let filename;
  let uploadResult;

  const postAmount = await mysqlConn.execute('SELECT COUNT(*) AS count FROM posts;');
  console.log(postAmount[0][0]);
  for (let index = 0; index < postAmount[0][0].count; index += 1) {
    console.log('--- --- --- ---');
    postInfo = await mysqlConn.execute('SELECT id, cover FROM posts LIMIT ?, 1;', [ index ]);
    console.log(postInfo[0][0].id);
    if (!postInfo[0][0].cover) {
      console.log('haven;t set cover image');
      continue;
    }
    console.log(postInfo[0][0].cover);
    try {
      imageFile = await downloader.image({
        url: config.pic_url + '/image/' + postInfo[0][0].cover,
        dest: './downloads',
        timeout: 6000,
      });
    } catch (err) {
      console.log(err);
      // await mysqlConn.execute('UPDATE posts SET cover = ? WHERE id = ?;', [null, postInfo[0][0].id]);
      continue;
    }
    fileext = filetype(imageFile.image).ext;
    filename = '/image/'
            + moment().format('YYYY/MM/DD/')
            + md5(imageFile.filename + moment().toLocaleString()).toString()
            + '.' + fileext;
    console.log(filename);
    try {
      uploadResult = await ossClient.put(filename, imageFile.filename);
    } catch (err) {
      console.log(err);
      continue;
    }
    await mysqlConn.execute('UPDATE posts SET cover = ? WHERE id = ?;', [ filename, postInfo[0][0].id ]);
    await fs.unlinkSync(imageFile.filename);
  }
}

async function coverAddSlash() {

  const mysqlConn = await mysql.createConnection({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_database,
    ssl: {},
  });

  let postInfo;

  const postAmount = await mysqlConn.execute('SELECT COUNT(*) AS count FROM posts;');
  console.log(postAmount[0][0].count);
  for (let index = 0; index < postAmount[0][0].count; index += 1) {
    console.log('--- --- --- ---');
    postInfo = await mysqlConn.execute('SELECT id, cover FROM posts LIMIT ?, 1;', [ index ]);
    console.log(postInfo[0][0].id);
    if (!postInfo[0][0].cover) {
      console.log('haven\'t set cover image');
      continue;
    }
    console.log(postInfo[0][0].cover);
    await mysqlConn.execute('UPDATE posts SET cover = ? WHERE id = ?;', [ '/' + postInfo[0][0].cover, postInfo[0][0].id ]);
  }
}

async function moveAvatar() {

  const mysqlConn = await mysql.createConnection({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_database,
    ssl: {},
  });

  let userInfo;
  let imageFile;
  let fileext;
  let filename;
  let uploadResult;

  const userAmount = await mysqlConn.execute('SELECT COUNT(*) AS count FROM users;');
  console.log(userAmount[0][0].count);
  for (let index = 0; index < userAmount[0][0].count; index += 1) {
    console.log('--- --- --- ---');
    userInfo = await mysqlConn.execute('SELECT id, avatar FROM users LIMIT ?, 1;', [ index ]);
    console.log(userInfo[0][0].id);
    if (!userInfo[0][0].avatar) {
      console.log('haven\'t set avatar image');
      continue;
    }
    console.log(userInfo[0][0].avatar);
    try {
      imageFile = await downloader.image({
        url: config.pic_url + '/image/' + userInfo[0][0].avatar,
        dest: './downloads',
        timeout: 6000,
      });
    } catch (err) {
      console.log(err);
      // await mysqlConn.execute('UPDATE users SET avatar = ? WHERE id = ?;', [null, userInfo[0][0].id]);
      continue;
    }
    fileext = filetype(imageFile.image).ext;
    filename = '/avatar/'
            + moment().format('YYYY/MM/DD/')
            + md5(imageFile.filename + moment().toLocaleString()).toString()
            + '.' + fileext;
    console.log(filename);
    try {
      uploadResult = await ossClient.put(filename, imageFile.filename);
    } catch (err) {
      console.log(err);
      continue;
    }
    await mysqlConn.execute('UPDATE users SET avatar = ? WHERE id = ?;', [ filename, userInfo[0][0].id ]);
    await fs.unlinkSync(imageFile.filename);
  }
}

async function avatarAddSlash() {

  const mysqlConn = await mysql.createConnection({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_password,
    database: config.mysql_database,
    ssl: {},
  });

  let userInfo;

  const userAmount = await mysqlConn.execute('SELECT COUNT(*) AS count FROM users;');
  console.log(userAmount[0][0].count);
  for (let index = 0; index < userAmount[0][0].count; index += 1) {
    console.log('--- --- --- ---');
    userInfo = await mysqlConn.execute('SELECT id, avatar FROM users LIMIT ?, 1;', [ index ]);
    console.log(userInfo[0][0].id);
    if (!userInfo[0][0].avatar) {
      console.log('haven\'t set avatar image');
      continue;
    }
    console.log(userInfo[0][0].avatar);
    await mysqlConn.execute('UPDATE users SET avatar = ? WHERE id = ?;', [ '/' + userInfo[0][0].avatar, userInfo[0][0].id ]);
  }
}

moveCover();
moveAvatar();
// coverAddSlash();
// avatarAddSlash();
