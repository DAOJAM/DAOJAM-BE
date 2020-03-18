'use strict';

const Service = require('egg').Service;
const elastic = require('@elastic/elasticsearch');
const moment = require('moment');
const consts = require('./consts');

class SearchService extends Service {
  constructor(ctx, app) {
    super(ctx, app);
    // const elaClient = new elastic.Client({ node: this.config.elasticsearch.host });
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

  async searchPost(keyword, channelId = null, page = 1, pagesize = 10) {
    this.logger.info('SearchService:: SearchPost for', keyword);
    let postQuery;
    const elasticClient = new elastic.Client({ node: this.config.elasticsearch.host });
    const searchProject = {
      index: this.config.elasticsearch.indexPosts,
      from: pagesize * (page - 1),
      size: 1 * pagesize,
      body: {
        query: {
          // match: {
          //   content: keyword,
          // },
          // multi_match: {
          //   query: keyword,
          //   fields: [ 'nickname', 'title', 'content' ],
          // },

          // 时间影响评分
          function_score: {
            functions: [
              {
                exp: {
                  create_time: {
                    origin: 'now',
                    offset: '0d',
                    scale: '30d',
                  },
                },
              },
            ],
            query: {
              // 接下来会被填充
            },
          },
        },
        // 高亮设置
        highlight: {
          fields: {
            // content: {},
            // nickname: {},
            title: {},
            content: {},
          },
        },
      },
    };
    // 指定category查询
    if (channelId) {
      // searchProject.body.query.function_score.query.push({ term: { channel_id: channelId } });
      searchProject.body.query.function_score.query = {
        bool: {
          must: [
            { term: { channel_id: channelId } },
            {
              bool: {
                // 匹配标题和内容其中一个
                should: [
                  { match: { title: keyword } },
                  { match: { content: keyword } },
                ],
              },
            },
          ],
        },
      };
    } else {
      searchProject.body.query.function_score.query = {
        bool: {
          should: [
            { match: { title: keyword } },
            { match: { content: keyword } },
          ],
        },
      };
    }

    try {
      postQuery = await elasticClient.search(searchProject);
    } catch (err) {
      this.logger.error('SearchService:: SearchPost: error: ', err);
      return null;
    }
    // const postQuery = await elasticClient.search(searchProject);

    // const resultList = [];
    const postids = [];
    // let matches = {};
    const count = postQuery.body.hits.total.value;
    // 加了多匹配之后， 没有匹配到的项目在highlight里面没有
    for (let hindex = 0; hindex < postQuery.body.hits.hits.length; hindex += 1) {
      postids.push(postQuery.body.hits.hits[hindex]._source.id);
    }
    this.logger.info('SearchService:: SearchPost ids', postids);

    // 传统的获取文章列表方法
    let postList = await this.service.post.getPostList(postids, { short_content: true });

    this.logger.info('SearchService:: SearchPost postList.length', postList.length);

    // 再度排序
    postList = postList.sort((a, b) => {
      return postids.indexOf(a.id) - postids.indexOf(b.id);
    });

    // 填充高亮匹配信息
    for (let pindex = 0; pindex < postList.length; pindex += 1) {
      if (postQuery.body.hits.hits[pindex].highlight.title) {
        postList[pindex].title = postQuery.body.hits.hits[pindex].highlight.title[0];
      } else {
        postList[pindex].title = postQuery.body.hits.hits[pindex]._source.title;
      }

      if (postQuery.body.hits.hits[pindex].highlight.content) {
        let new_content = '';
        for (let cindex = 0; cindex < postQuery.body.hits.hits[pindex].highlight.content.length; cindex += 1) {
          new_content += (postQuery.body.hits.hits[pindex].highlight.content[cindex] + '...');
        }
        postList[pindex].short_content = new_content;
      }
    }

    return { count, list: postList };
  }

  async searchUser(keyword, page = 1, pagesize = 10, current_user = null) {
    let userQuery;
    const elasticClient = new elastic.Client({ node: this.config.elasticsearch.host });
    const searchProject = {
      index: this.config.elasticsearch.indexUsers,
      from: pagesize * (page - 1),
      size: 1 * pagesize,
      body: {
        query: {
          bool: {
            should: [
              // { match: { nickname: keyword } },
              {
                multi_match: {
                  query: keyword,
                  fields: [ 'nickname', 'nickname.english' ],
                  type: 'most_fields',
                },
              },
              { match: { username: keyword } },
            ],
          },
        },
        highlight: {
          fields: {
            nickname: {},
            'nickname.english': {},
            username: {},
          },
        },
      },
    };

    try {
      userQuery = await elasticClient.search(searchProject);
    } catch (err) {
      this.logger.error('SearchService:: SearchUser: error: ', err);
      return null;
    }
    // return userQuery;

    const userids = [];
    const count = userQuery.body.hits.total.value;
    const list = userQuery.body.hits.hits;

    // 生成userid列表
    for (let i = 0; i < list.length; i++) {
      userids.push(list[i]._source.id);
    }

    if (userids.length === 0) {
      return { count: 0, list: [] };
    }

    // 获取详情
    let userList = await this.service.user.getUserList(userids, current_user);

    // 重排序
    userList = userList.sort((a, b) => {
      return userids.indexOf(a.id) - userids.indexOf(b.id);
    });

    // 填充高亮匹配信息
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].highlight['nickname.english']) userList[i].nickname = list[i].highlight['nickname.english'][0];
      if (list[i].highlight.nickname) userList[i].nickname = list[i].highlight.nickname[0];

      if (list[i].highlight.username) userList[i].username = list[i].highlight.username[0];
    }

    return { count, list: userList };
  }

  async precisePost(postid) {
    // const thePost = await this.app.mysql.query(
    //   'SELECT p.id AS postid, p.username, p.create_time, u.nickname, p.title, p.short_content '
    //   + 'FROM posts p LEFT JOIN users u ON p.uid = u.id WHERE p.id = ?;',
    //   [ postid ]
    // );

    const postList = await this.service.post.getPostList([ postid ], { short_content: true });

    if (postList.length === 0) {
      return { count: 0, list: [] };
    }
    return { count: 1, list: postList };
  }

  // 新建和更新文章， 都可以用这个
  async importPost(postid, userid, title, content) {
    this.logger.error('SearchService:: importPost: start ', postid, userid, title, content);
    const author = await this.service.user.get(userid);

    if (author.length === 0) {
      return null;
    }

    const elaClient = new elastic.Client({ node: this.config.elasticsearch.host });
    try {
      await elaClient.index({
        id: postid,
        index: this.config.elasticsearch.indexPosts,
        body: {
          id: postid,
          create_time: moment(),
          // uid: author[0].id,
          // username: author[0].username,
          // nickname: author[0].nickname,
          title,
          content,
          channel_id: 1,
        },
      });
    } catch (err) {
      this.logger.error('SearchService:: importPost: error ', err);
      return null;
    }
  }

  async deletePost(postid) {
    const elaClient = new elastic.Client({ node: this.config.elasticsearch.host });

    try {
      await elaClient.delete({
        id: postid,
        index: this.config.elasticsearch.indexPosts,
      });
    } catch (err) {
      this.logger.error('SearchService:: deletePost: error ', err);
      return null;
    }
    return 1;
  }

  // todo：增加一种方式直接传入user对象
  async importUser(userid) {
    this.logger.info('searchService importUser uid', userid);
    const user = await this.app.mysql.query(
      'SELECT id, username, nickname, platform FROM users WHERE id = ?;',
      [ userid ]
    );
    this.logger.info('searchService importUser user', user);
    if (user.length === 0) {
      return null;
    }

    // 交易所虚拟账号不要插入ES
    if (user[0].platform === consts.platforms.cny) {
      return null;
    }

    const elaClient = new elastic.Client({ node: this.config.elasticsearch.host });
    try {
      await elaClient.index({
        id: userid,
        index: this.config.elasticsearch.indexUsers,
        body: {
          id: userid,
          create_time: user[0].create_time,
          username: user[0].username,
          nickname: user[0].nickname,
        },
      });
    } catch (err) {
      this.logger.error('SearchService:: deletePost: error ', err);
      return null;
    }
    return 1;
  }

  // 每搜索一次，次数+1
  async writeLog(word, area) {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    try {
      await this.app.mysql.query(
        'INSERT INTO search_count (word, create_time, update_time, search_count, search_area) VALUES (:word, :now, :now, 1, :area)'
        + ' ON DUPLICATE KEY UPDATE search_count = search_count + 1, update_time = :now;',
        { word, now, area }
      );
    } catch (err) {
      this.ctx.logger.error('SearchService:: writeLog: error: ', err);
      return 1;
    }
    return 0;
  }

  // 返回次数最多的几条搜索
  async recommandWord(amount = 5, area = 1) {
    let result = [];
    try {
      result = await this.app.mysql.query(
        'SELECT word FROM search_count WHERE search_area = :area ORDER BY search_count DESC, update_time DESC LIMIT :amount;',
        { area, amount }
      );
    } catch (err) {
      this.logger.error('SearchService:: RecommandWord: error ', err);
      return null;
    }
    return result;
  }
  async searchShare(keyword, page = 1, pagesize = 10) {
    this.logger.info('SearchService:: Search share for', keyword);
    let shareQuery;
    const elasticClient = new elastic.Client({ node: this.config.elasticsearch.host });
    const searchProject = {
      index: this.config.elasticsearch.indexShares,
      from: pagesize * (page - 1),
      size: 1 * pagesize,
      body: {
        query: {
          // 时间影响评分
          function_score: {
            functions: [
              {
                exp: {
                  create_time: {
                    origin: 'now',
                    offset: '0d',
                    scale: '30d',
                  },
                },
              },
            ],
            query: {
              bool: {
                should: [
                  { match: { content: keyword } },
                ],
              },
            },
          },
        },
        // 高亮设置
        highlight: {
          fields: {
            content: {},
          },
        },
      },
    };
    try {
      shareQuery = await elasticClient.search(searchProject);
    } catch (err) {
      this.logger.error('SearchService:: SearchShare: error: ', err);
      return null;
    }
    const shareids = [];
    const count = shareQuery.body.hits.total.value;
    const list = shareQuery.body.hits.hits;

    // 生成shareids列表
    for (let i = 0; i < list.length; i++) {
      shareids.push(list[i]._source.id);
    }
    if (shareids.length === 0) {
      return { count: 0, list: [] };
    }

    // 获取详情
    const shareList = await this.app.mysql.query(
      `SELECT a.id, a.uid, a.author, a.title, a.hash, a.create_time, a.cover, a.require_holdtokens, a.require_buy, a.short_content,
      b.nickname, b.avatar, 
      c.real_read_count AS \`read\`, c.likes 
      FROM posts a
      LEFT JOIN users b ON a.uid = b.id 
      LEFT JOIN post_read_count c ON a.id = c.post_id 
      WHERE a.id IN (:shareids)
      ORDER BY FIELD(a.id, :shareids);`,
      { shareids }
    );

    // 填充高亮匹配信息
    for (let i = 0; i < list.length; i++) {
      if (list[i].highlight.content) shareList[i].short_content = list[i].highlight.content[0];
    }

    return { count, list: shareList };
  }
  async searchToken(keyword, page = 1, pagesize = 10) {
    let tokenQuery;
    const elasticClient = new elastic.Client({ node: this.config.elasticsearch.host });
    const searchProject = {
      index: this.config.elasticsearch.indexTokens,
      from: pagesize * (page - 1),
      size: 1 * pagesize,
      body: {
        query: {
          bool: {
            // name, symbol, brief, introduction, contract_address
            should: [
              { match: { name: keyword } },
              { match: { symbol: keyword } },
              { match: { brief: keyword } },
              { match: { introduction: keyword } },
              { match: { contract_address: keyword } },
            ],
          },
        },
        highlight: {
          fields: {
            name: {},
            symbol: {},
            brief: {},
            introduction: {},
            contract_address: {},
          },
        },
      },
    };

    try {
      tokenQuery = await elasticClient.search(searchProject);
    } catch (err) {
      this.logger.error('SearchService:: SearchUser: error: ', err);
      return null;
    }

    const tokenids = [];
    const count = tokenQuery.body.hits.total.value;
    const list = tokenQuery.body.hits.hits;

    // 生成tokenids列表
    for (let i = 0; i < list.length; i++) {
      tokenids.push(list[i]._source.id);
    }

    if (tokenids.length === 0) {
      return { count: 0, list: [] };
    }

    // 获取详情
    const tokenList = await this.app.mysql.query(
      `SELECT id, uid, \`name\`, symbol, decimals, total_supply, create_time, logo, brief, introduction, contract_address 
      FROM minetokens
      WHERE id IN (:tokenids)
      ORDER BY FIELD(id, :tokenids);`,
      { tokenids }
    );

    // 填充高亮匹配信息
    for (let i = 0; i < list.length; i++) {
      if (list[i].highlight.name) tokenList[i].name = list[i].highlight.name[0];
      if (list[i].highlight.symbol) tokenList[i].symbol = list[i].highlight.symbol[0];
      if (list[i].highlight.brief) tokenList[i].brief = list[i].highlight.brief[0];
      if (list[i].highlight.introduction) tokenList[i].introduction = list[i].highlight.introduction[0];
      if (list[i].highlight.contract_address) tokenList[i].contract_address = list[i].highlight.contract_address[0];
    }

    return { count, list: tokenList };
  }
  async importShare({ id, content }) {
    this.logger.error('SearchService:: importShare: start ', { id, content });

    const elaClient = new elastic.Client({ node: this.config.elasticsearch.host });
    try {
      await elaClient.index({
        id,
        index: this.config.elasticsearch.indexShares,
        body: {
          id,
          create_time: moment(),
          channel_id: 3,
          content,
        },
      });
    } catch (err) {
      this.logger.error('SearchService:: importPost: error ', err);
      return null;
    }
  }
  async importToken({ id, name, symbol, brief, introduction, contract_address }) {
    this.logger.error('SearchService:: importToken: start ', { id, name, symbol, brief, introduction, contract_address });

    const elaClient = new elastic.Client({ node: this.config.elasticsearch.host });
    try {
      await elaClient.index({
        id,
        index: this.config.elasticsearch.indexTokens,
        body: {
          id,
          create_time: moment(),
          name,
          symbol,
          brief,
          introduction,
          contract_address,
        },
      });
    } catch (err) {
      this.logger.error('SearchService:: importToken: error ', err);
      return null;
    }
  }
}

module.exports = SearchService;

