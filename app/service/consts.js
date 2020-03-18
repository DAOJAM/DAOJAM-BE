'use strict';

module.exports = {
  // posts的频道
  postChannels: {
    article: 1, // 普通文章
    product: 2, // 商品
  },

  payActions: {
    support: 1, // 赞赏
    buy: 2, // 购买
  },

  assetTypes: {
    supportExpenses: 'support_expenses', // 赞赏/投资支出
    buyExpenses: 'buy_expenses', // 购买支出

    fissionIncome: 'fission_income', // 赞赏/投资裂变收入
    referralIncome: 'referral_income', // 推荐收入

    authorSaleIncome: 'author_sale_income', // 作者 销售收入
    authorSupportedIncome: 'author_supported_income', // 作者 被投资收入

    withdraw: 'withdraw', // 提现
    buyad: 'buyad', // 橙皮书买广告
    earn: 'earn', // 橙皮书收入

    recharge: 'recharge', // 充值
    transferOut: 'transfer_out', // 转出资产
    transferIn: 'transfer_in', // 转入资产
  },

  commentTypes: {
    support: 1,
    order: 2,
    point: 3,
  },

  // 积分系统
  pointTypes: {
    read: 'read', // 用户阅读，数据库中记录readLike、readDislike两种类型，在redis中统一为read
    readLike: 'read_like', // 点赞
    readDislike: 'read_dislike', // 点踩
    readReferral: 'read_referral', // 阅读，推荐人
    beread: 'beread', // 读者的文章被阅读

    readNew: 'read_new', // 用户阅读新文章，额外获得的
    bereadNew: 'beread_new', // 读者的新文章被阅读，额外获得的

    publish: 'publish', // 发布文章
    publishReferral: 'publish_referral', // 发布文章，推荐人获取积分

    regInviter: 'reg_inviter', // 注册，邀请人
    regInvitee: 'reg_invitee', // 注册，被邀请人
    regInviteFinished: 'reg_invite_finished', // 邀请任务完成

    login: 'login', // 登录任务
    profile: 'profile', // 完善资料任务

    commentPay: 'comment_pay', // 评论支付
    commentIncome: 'comment_income', // 被评论收入
  },

  // 用户账号所属平台
  platforms: {
    email: 'email',
    eos: 'eos',
    ont: 'ont',
    github: 'github',
    cny: 'cny',
  },

  // 货币符号
  symbols: {
    EOS: 'EOS',
    ONT: 'ONT',
    CNY: 'CNY',
  },

  // 用户权限控制，二进制
  userStatus: {
    hasMineTokenPermission: 2, // 10
    isSeedUser: 1, // 01
  },

  mineTokenTransferTypes: {
    issue: 'issue',
    mint: 'mint',
    transfer: 'transfer',
    exchange_purchase: 'exchange_purchase',
    exchange_addliquidity: 'exchange_addliquidity',
    exchange_removeliquidity: 'exchange_removeliquidity',
  },

  socialTypes1: {
    qq: 'QQ',
    wechat: 'Wechat',
    weibo: 'Weibo',
    telegram: 'Telegram',
    twitter: 'Twitter',
    facebook: 'Facebook',
    github: 'Github',
  },

  socialTypes: [
    'QQ',
    'Wechat',
    'Weibo',
    'Telegram',
    'Twitter',
    'Facebook',
    'Github',
  ],

  mailTemplate: {
    registered: 'registered',
    resetPassword: 'resetPassword',
  },
};
