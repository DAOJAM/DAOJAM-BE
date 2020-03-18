'use strict';

const Controller = require('../core/base_controller');
const moment = require('moment');
const _ = require('lodash');
const axios = require('axios');
const ecc = require('eosjs-ecc');


class AdsController extends Controller {

  async statistics() {
    try {
      const count = await this.app.mysql.query("select count(*) as count from orange_actions where act_name='incomelog' and amount < 0;");

      const users = await this.app.mysql.query('select distinct user from orange_actions where user is not null');

      this.ctx.body = this.ctx.msg.success;
      this.ctx.body.data = {
        play_count: count[0].count,
        user_count: users.length,
      };
    } catch (err) {
      this.ctx.logger.error('get statistics error', err);
      this.ctx.body = this.ctx.msg.getStatisticsError;
    }
  }

  async submit() {
    const ctx = this.ctx;
    const { title = '', url = '', link = '', content = '', hash = '' } = ctx.request.body;

    const user = ctx.user;

    try {

      // 有hash 表示单篇文章的广告位， 无hash，则表示全局广告位
      if (hash === '') {
        const result = await this.eosClient.getTableRows({
          json: 'true',
          code: this.ctx.app.config.eos.orange_contract,
          scope: this.ctx.app.config.eos.orange_contract,
          table: 'global',
          limit: 1,
        });

        const global = result.rows[0];

        if (global && global.last_buyer == user.username) {

          const now = moment().format('YYYY-MM-DD HH:mm:ss');
          await this.app.mysql.query(
            'INSERT INTO ads(id, uid, title, url, link, content, create_time, update_time, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE uid = ?, title=?, url=?, link=?, content=?, update_time = ?, hash=?;',
            [ 1, user.id, title, url, link, content, now, now, hash,
              user.id, title, url, link, content, now, hash ]
          );

          ctx.body = ctx.msg.success;
        } else {
          ctx.logger.error('submit ad error, wrong user');
          this.ctx.body = this.ctx.msg.submitAdErrorOfWrongUser;
          return;
        }

      } else {
        const hash2 = ecc.sha256(hash);
        const key = await this.checksum256Reversed(hash2);

        const response = await axios.post('http://eos.greymass.com/v1/chain/get_table_rows',
          {
            json: true,
            code: ctx.app.config.eos.orange_contract,
            scope: ctx.app.config.eos.orange_contract,
            table: 'ads',
            table_key: 'hash',
            index_position: 2,
            key_type: 'sha256',
            lower_bound: key,
            upper_bound: key,
            limit: 1,
          }
        );

        if (response.data && response.data.rows && response.data.rows.length > 0) {
          const row = response.data.rows[0];
          ctx.logger.info('debug submit ads', user, row);

          if (row.owner === user.username) {
            const now = moment().format('YYYY-MM-DD HH:mm:ss');
            await this.app.mysql.query(
              'INSERT INTO ads(uid, title, url, link, content, create_time, update_time, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE uid = ?, title=?, url=?, link=?, content=?, update_time = ?, hash=?;',
              [ user.id, title, url, link, content, now, now, hash,
                user.id, title, url, link, content, now, hash ]
            );

            ctx.body = ctx.msg.success;
          } else {
            ctx.logger.error('submit ad error, wrong user');
            this.ctx.body = this.ctx.msg.submitAdErrorOfWrongUser;
            return;
          }
        } else {
          ctx.logger.error('ad notfound in contract');
          this.ctx.body = this.ctx.msg.adNotFound;
          return;
        }
      }
    } catch (err) {
      ctx.logger.error('submit ad error', err);
      this.ctx.body = this.ctx.msg.submitAdError;
    }
  }

  async checksum256Reversed(hash) {
    const strMatch = str => str.match(/\w{2}/g);
    const arrReverse = arr => arr.reverse();
    const strMatchResult1 = strMatch(hash.slice(0, 32));
    const strMatchResult2 = strMatch(hash.slice(32));
    return (
      arrReverse(strMatchResult1).join('') + arrReverse(strMatchResult2).join('')
    );
  }

  async ad() {

    const { hash = '' } = this.ctx.query;

    try {
      let ad;

      if (hash === 'last') {
        const last = await this.app.mysql.query(
          'select a.title, a.url, a.link, a.content,a.hash, b.username,a.update_time, b.id as uid  from ads a left join users b on a.uid = b.id order by a.update_time desc limit 2'
        );
        ad = last[0] || null;
      } else {
        const ads = await this.app.mysql.query(
          `select a.title, a.url, a.link, a.content,a.hash, b.username, b.id as uid  from ads a left join users b on a.uid = b.id where a.hash = '${hash}'`
        );
        ad = ads[0] || null;
      }

      ad.username = this.service.user.maskEmailAddress(ad.username);

      this.ctx.body = this.ctx.msg.success;
      this.ctx.body.data = ad;
    } catch (err) {
      this.ctx.logger.error('get ad error', err);
      this.ctx.body = this.ctx.msg.getAdError;
    }
  }

}

module.exports = AdsController;
