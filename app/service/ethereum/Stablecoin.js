
'use strict';
const Web3Service = require('./web3');
const ECny = require('./ECny.json');
const StablecoinAddress = '0x543fed95e598227737Ad22feB22B0fEe53114d91';

class StablecoinService extends Web3Service {
  constructor(ctx, app) {
    super(ctx, app);
    const ABI = ECny.abi;
    ctx.StablecoinContract = new this.web3.eth.Contract(ABI, StablecoinAddress);
  }

  /**
   * ⚠️ 这个 _mint 函数没有设置权限控制，请在 controller 调用时小心设置好权限控制
   * _mint, 我们作为合约 Minter 给 to 印钱
   * @param {string} to 收新铸币的地址，如果是一个合约地址，则必须实现 IERC777Recipient 接口
   * @param {string} amount 铸币数量，单位是wei（最小单位）
   */
  _mint(to, amount) {
    const contract = this.ctx.StablecoinContract;
    const encodeABI = contract.methods.mint(to, amount).encodeABI();
    return this.sendTransactionWithOurKey(encodeABI);
  }

  /**
   * ERC20 的 transferFrom，需要 sender 提前在合约 approve 了我们的动用资金的权限
   * @param {string} sender 发送者的公钥
   * @param {string} recipient 接收者的公钥
   * @param {string} amount 数额
   */
  transferFrom(sender, recipient, amount) {
    const contract = this.ctx.StablecoinContract;
    const encodeABI = contract.methods.transferFrom(sender, recipient, amount).encodeABI();
    return this.sendTransactionWithOurKey(encodeABI);
  }

  /**
   * ERC20 的 transfer
   * @param {string} recipient 接收者的公钥
   * @param {string} amount 数额
   */
  transfer(recipient, amount) {
    const contract = this.ctx.StablecoinContract;
    const encodeABI = contract.methods.transfer(recipient, amount).encodeABI();
    return this.sendTransactionWithOurKey(encodeABI, { to: StablecoinAddress });
  }

  /**
   * burn , burner 销毁饭票的入口
   * @param {*} amount 销毁的数额
   */
  burn(amount) {
    const contract = this.ctx.StablecoinContract;
    const encodeABI = contract.methods.transfer(amount).encodeABI();
    return this.sendTransactionWithOurKey(encodeABI);
  }

}

module.exports = StablecoinService;
