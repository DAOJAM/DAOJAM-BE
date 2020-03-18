'use strict';
const IPFS = require('ipfs-mini');
const axios = require('axios');
const FormData = require('form-data');
const Service = require('egg').Service;

class ipfs extends Service {
  constructor(ctx, app) {
    super(ctx, app);
    const { host, port, protocol } = this.config.ipfs_service;
    this.ipfs = new IPFS({
      host,
      port,
      protocol,
    });
  }
  cat(hash) {
    return new Promise((resolve, reject) => {
      this.ipfs.cat(hash, (err, result) => {
        if (err) {
          this.logger.error('ipfs.cat error: %j', err);
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }
  add(data) {
    return new Promise((resolve, reject) => {
      this.ipfs.add(data, (err, result) => {
        if (err) {
          this.logger.error('ipfs.add error: %j', err);
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }
  async uploadToAws(file) {
    const { username, password } = this.config.awsIpfs;
    const fd = new FormData();
    fd.append('', file);
    try {
      const { data } = await axios.post('https://ipfs.smartsignature.io/api/v0/add', fd, {
        auth: { username, password },
        headers: fd.getHeaders(),
      });
      return data.Hash;
    } catch (error) {
      this.logger.info('uploadToAws failed', error);
    }
  }
}

module.exports = ipfs;
