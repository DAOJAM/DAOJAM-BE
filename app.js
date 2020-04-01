const Web3 = require('web3');
const QVVotingJSON = require('./app/service/ethereum/abi/QVVoting.json');
const contractAddress = '0x7260e769005Fec7A9ba7415AdF45D69AB126a33d';

class Bootstrapper {

  constructor(app) {
    this.app = app;
  }

  async didReady() {
    await this.loadCache();
    const ctx = await this.app.createAnonymousContext();
    await this.loadWeb3(ctx);
  }
  async loadWeb3(ctx) {
    const ApiEndpoint = 'https://rinkeby.infura.io/v3/e25357f98f9446e3bbdca110b0fefdf1';
    const WssEndpoint = 'wss://rinkeby.infura.io/ws/v3/e25357f98f9446e3bbdca110b0fefdf1';
    const HttpProvider = new Web3.providers.HttpProvider(ApiEndpoint);
    const WebsocketProvider = new Web3.providers.WebsocketProvider(WssEndpoint);
    const web3 = new Web3(HttpProvider);
    web3.setProvider(WebsocketProvider);
    const contract = new web3.eth.Contract(QVVotingJSON.abi, contractAddress);
    contract.events.ProposalCreated({})
      .on('data', async event => {
        console.log(event);
        // const { creator, ProposalID, description, votingTimeInHours }
        const { ProposalID, name, description, creator } = event.returnValues;
        const blockNumber = event.blockNumber;
        const trx = event.transactionHash;
        await ctx.service.project.create({
          pid: ProposalID,
          name,
          description,
          block_number: blockNumber,
          trx,
          owner: creator,
        });
      })
      .on('error', console.error);
    contract.events.VoteCasted({})
      .on('data', async event => {
        console.log(event);
        const { voter, ProposalID, weight } = event.returnValues;
        // create({ pid, voter, weight, block_number, trx })
        const blockNumber = event.blockNumber;
        const trx = event.transactionHash;
        await ctx.service.votingLog.create({
          pid: ProposalID,
          voter,
          weight,
          block_number: blockNumber,
          trx,
        });
      })
      .on('error', console.error);
  }

  async loadCache() {
    const { mysql, redis } = this.app;
    await this.app.redis.del('post:score:filter:1');
    await this.app.redis.del('post:score:filter:3');
    await this.app.runSchedule('calculate_hot_score');
    await this.app.runSchedule('count_token_member');

    const schemaVersionKey = 'schema_version';
    const cacheSchemaVersion = 2;

    const currentVersion = await redis.get(schemaVersionKey);
    if (currentVersion !== null && Number(currentVersion) >= cacheSchemaVersion) {
      return;
    }

    this.app.logger.info('Current cache is outdated. Preloading new version...');

    const pipeline = redis.multi();

    let keys = await redis.keys('post:*');
    if (keys.length > 0) pipeline.del(keys);

    pipeline.del('post');

    const posts = await mysql.query('SELECT id, status, channel_id, is_recommend, hot_score, time_down, require_holdtokens, require_buy FROM posts;')
    for (const { id, status, channel_id, is_recommend, require_holdtokens, time_down, hot_score, require_buy } of posts) {
      pipeline.sadd('post', id);

      if (status !== 0) {
        continue;
      }

      if (channel_id === 1) {
        if (is_recommend) pipeline.zadd('post:recommend', id, id);

        // if (require_holdtokens === 0 && require_buy === 0) {
        //   pipeline.zadd('post:hot:filter:1', hot_score, id);
        // } else {
        //   if (require_holdtokens) pipeline.zadd('post:hot:filter:2', hot_score, id);
        //   if (require_buy) pipeline.zadd('post:hot:filter:4', hot_score, id);
        // }
      }
    }

    pipeline.expire('user:recommend', 300);
    pipeline.expire('post:recommend', 300);

    pipeline.set(schemaVersionKey, cacheSchemaVersion);

    await pipeline.exec();
  }

}

module.exports = Bootstrapper;
