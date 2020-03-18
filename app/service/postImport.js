'use strict';

const Service = require('egg').Service;
const downloader = require('image-downloader');
// const FromData = require('form-data');
const moment = require('moment');
const md5 = require('crypto-js/md5');
const axios = require('axios');
const htmlparser = require('node-html-parser');
const pretty = require('pretty');
const turndown = require('turndown');
const cheerio = require('cheerio'); // 如果是客户端渲染之类的 可以考虑用 puppeteer
class PostImportService extends Service {

  // 搬运时候上传图片
  async uploadArticleImage(url, cacheFile = './uploads/today.jpg') {
    let imageFile;
    // let imageUpload = null;
    const filetype = cacheFile.split('.');
    try {
      imageFile = await downloader.image({
        url,
        dest: cacheFile,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_0_1 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) Mobile/14A403 MicroMessenger/6.5.18 NetType/WIFI Language/zh_CN',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
    } catch (e) {
      this.logger.error('PostImportService:: uploadArticleImage: Download Image failed..', e);
      return null;
    }
    // 上传的文件的名字
    const filename = '/image/'
      + moment().format('YYYY/MM/DD/')
      + md5(imageFile.filename).toString()
      + '.' + filetype[filetype.length - 1];
    const uploadImageResult = await this.service.post.uploadImage(filename, imageFile.filename);
    if (uploadImageResult !== 0) {
      this.logger.info('PostImportService:: uploadArticleImage: Upload Image Failed...');
      return null;
    }
    return filename;
  }

  // 搬运微信文章
  async handleWechat(url) {
    // 获取文章内容
    let rawPage;
    try {
      rawPage = await axios({
        url,
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 10_0_1 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) Mobile/14A403 MicroMessenger/6.5.18 NetType/WIFI Language/zh_CN',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
    } catch (err) {
      this.logger.error('PostImportService:: handleWechat: error:', err);
      return null;
    }
    const $ = cheerio.load(rawPage.data,{decodeEntities : false});
    const mediaContent = $('div.rich_media_content');

    // 把图片上传至本站， 并替换链接
    // TBD: 仍然有出现图片未被替换的问题
    let imgRawUrl, imgUpUrl, imgFileName;
    // const imgElement = parsedPage.querySelector('div.rich_media_content').querySelectorAll('img');
    const _imgElement = mediaContent.find('img').toArray();

    for (let index = 0; index < _imgElement.length; index += 1) {
      imgRawUrl = _imgElement[index].attribs['data-src'];
      imgFileName = './uploads/today_' + Date.now() + '.' + _imgElement[0].attribs['data-type'];
      imgUpUrl = await this.uploadArticleImage(imgRawUrl, imgFileName);
      // 匹配图片URL， 并进行替换
      if (imgUpUrl) {
        _imgElement[index].attribs['data-src'] = _imgElement[index].attribs['data-src'].replace(
          /http[s]?:\/\/mmbiz\.q[a-z]{2,4}\.cn\/mmbiz_[a-z]{1,4}\/[a-zA-Z0-9]{50,100}\/[0-9]{1,4}\??[a-z0-9_=&]{0,100}/g, 'https://ssimg.frontenduse.top' + imgUpUrl);
        _imgElement[index].attribs.style = 'vertical-align: middle;width: 90%;height: 90%;';
      } else {
        this.logger.info('PostImportService:: handleWechat: upload Image failed, ignored');
        _imgElement[index].attribs['data-src'] = '';
      }
      _imgElement[index].attribs.src = _imgElement[index].attribs['data-src'];
    }
    // 处理视频
    const videos = $('iframe',mediaContent);
    for (const video of videos.toArray()){
      try {
      const vid = $(video).attr('data-mpvid');
      const url = `https://mp.weixin.qq.com/mp/videoplayer?action=get_mp_video_play_url&preview=0&__biz=&mid=&idx=&vid=${vid}&uin=&key=&pass_ticket=&wxtoken=&appmsg_token=&x5=0&f=json`;
      const {data} = await axios({
        url,method : 'GET',
        });
      const originSrc = data.url_info[0].url;
      $(video).after(`<video controls width="100%" name="media">
      <source src="${originSrc}" type="video/mp4"></video>`);
      $(video).remove();
    }catch (err){
      this.logger.error('PostImportService:: handleWechat: error while processing video:', err);
    }
    }
    let parsedContent = '';
    parsedContent = pretty($('div.rich_media_content').html());

    // 处理元数据 —— 标题、封面
    const metadata = await this.service.metadata.GetFromRawPage(rawPage, url);
    const { title } = metadata;

    let parsedCoverRaw;
    // 试图从 OpenGraph 读取 封面信息
    if (metadata.image) {
      // Yay! 再也不用regex匹配了
      parsedCoverRaw = metadata.image;
    } else if (rawPage.data.match(/msg_cdn_url = "http:\/\/mmbiz\.qpic\.cn\/mmbiz_jpg\/[0-9a-zA-Z]{10,100}\/0\?wx_fmt=jpeg"/)) {
      parsedCoverRaw = rawPage.data.match(/msg_cdn_url = "http:\/\/mmbiz\.qpic\.cn\/mmbiz_jpg\/[0-9a-zA-Z]{10,100}\/0\?wx_fmt=jpeg"/)[0];
    } else {
      // 文章可能较老，试图匹配 mmbiz 看看能不能找到图片
      parsedCoverRaw = rawPage.data.match(/msg_cdn_url = "http:\/\/mmbiz\.qpic\.cn\/mmbiz\/[0-9a-zA-Z]{10,100}\/0\?wx_fmt=jpeg"/);
      if (parsedCoverRaw) parsedCoverRaw = parsedCoverRaw[0];
    }
    // const parsedCover = parsedCoverRaw.substring(15, parsedCoverRaw.length - 1);
    const parsedCover = parsedCoverRaw;
    const parsedCoverUpload = './uploads/today_wx_' + Date.now() + '.jpg';
    const coverLocation = await this.uploadArticleImage(parsedCover, parsedCoverUpload);
    // console.log(parsedTitle);
    // console.log(parsedCover);
    // console.log(parsedContent);

    const articleObj = {
      title,
      cover: coverLocation,
      content: parsedContent,
    };

    return articleObj;
  }

  // 处理橙皮书文章
  async handleOrange(url) {
    // 拉取文章内容
    let articleContent = '';
    let rawPage = null;
    try {
      rawPage = await axios.get(url, {
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
    } catch (err) {
      this.logger.error('PostImportService:: handleOrange: error:', err);
      return null;
    }
    const { title } = await this.service.metadata.GetFromRawPage(rawPage, url);

    // console.log(rawPage);
    // Parser 处理， 转化为markdown， 因平台而异
    const parsedPage = htmlparser.parse(rawPage.data);
    const parsedContent = parsedPage.querySelector('div.article-content');
    const parsedCover = parsedPage.querySelector('div.img-center-cropped.float-img').rawAttributes.style;
    const coverRe = new RegExp(/url\(\'.*\'\)/);
    const coverUrl = coverRe.exec(parsedCover)[0];
    // for (let index = 0; index < parsedContent.childNodes.length; index += 1) {
    //     articleContent += parsedContent.childNodes[index].toString();
    // }
    // 转化为md
    const turndownService = new turndown();
    articleContent = turndownService.turndown(parsedContent.toString());

    // 上传封面
    const parsedCoverUpload = './uploads/today_orange_' + Date.now() + '.jpg';
    const coverLocation = await this.uploadArticleImage(coverUrl.substring(5, coverUrl.length - 2), parsedCoverUpload);

    const articleObj = {
      title,
      cover: coverLocation,
      content: articleContent,
    };

    return articleObj;
  }

  // 处理链闻文章
  async handleChainnews(url) {
    // 拉取文章内容
    let rawPage;
    try {
      rawPage = await axios({
        url,
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
    } catch (err) {
      this.logger.error('PostImportService:: handleChainnews: error:', err);
      return null;
    }
    // 处理元数据 —— 标题、封面
    const metadata = await this.service.metadata.GetFromRawPage(rawPage, url);
    const { title, image } = metadata;
    // Parser 处理， 转化为markdown， 因平台而异
    const parsedPage = htmlparser.parse(rawPage.data);
    const parsedContent = parsedPage.querySelector('div.post-content.markdown');
    // const coverRe = new RegExp(//);
    const turndownService = new turndown();
    const articleContent = turndownService.turndown(parsedContent.toString());

    const parsedCoverUpload = './uploads/today_chainnews_' + Date.now() + '.jpg';
    const coverLocation = await this.uploadArticleImage(image.substring(0, image.length - 6), parsedCoverUpload);


    const articleObj = {
      title,
      cover: coverLocation,
      content: articleContent,
    };

    return articleObj;
  }

  // 处理简书文章
  async handleJianShu(url) {
    // 拉取文章内容
    let rawPage;
    try {
      rawPage = await axios({
        url,
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
    } catch (err) {
      this.logger.error('PostImportService:: handleJianShu: error:', err);
      return null;
    }
    const { title } = await this.service.metadata.GetFromRawPage(rawPage, url);
    // Parser 处理， 转化为markdown， 因平台而异
    const $ = cheerio.load(rawPage.data);
    // 不删掉 fill 图片会走样
    $('div.image-container-fill').each(function() {
      $(this).remove();
    });
    const mediaContent = $('article');
    const _imgElement = mediaContent.find('img').toArray();
    let coverLocation = null;
    for (let i = 0; i < _imgElement.length; i++) {
      _imgElement[i].attribs.src = _imgElement[i].attribs['data-original-src'];
      let originalSrc = _imgElement[i].attribs.src;
      if (originalSrc.indexOf('http') === -1) originalSrc = 'https:' + originalSrc;
      const parsedCoverUpload = './uploads/today_jianshu_' + Date.now() + '.jpg';
      const imgUpUrl = await this.uploadArticleImage(originalSrc, parsedCoverUpload);
      if (i === 0) coverLocation = imgUpUrl;
      if (imgUpUrl) {
        _imgElement[i].attribs.src = _imgElement[i].attribs
          .src.replace(/[https:]?\/\/upload-images\.jianshu\.io\/upload_images\/[a-z0-9_=&\.\-]{0,100}/g, 'https://ssimg.frontenduse.top' + imgUpUrl);
        _imgElement[i].attribs['data-original-src'] = _imgElement[i]
          .attribs['data-original-src'].replace(/[https:]?\/\/upload-images\.jianshu\.io\/upload_images\/[a-z0-9_=&\.\-]{0,100}/g, 'https://ssimg.frontenduse.top' + imgUpUrl);
      }
    }

    const articleObj = {
      title,
      cover: coverLocation,
      content: mediaContent.html(),
    };

    return articleObj;
  }

  // 处理Gaojin Blog
  async handleGaojin(url) {
    // 拉取文章内容
    let rawPage;
    try {
      rawPage = await axios({
        url,
        method: 'get',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        },
      });
    } catch (err) {
      this.logger.error('PostImportService:: handleJianShu: error:', err);
      return {
        title: '',
        cover: '',
        content: '导入失败,请联系管理员!',
      };
    }

    try {
      const { title } = await this.service.metadata.GetFromRawPage(rawPage, url);
      const $ = cheerio.load(rawPage.data);
      const parsedContent = $('#main .article-inner');
      $('#main .article-footer').remove();
      const turndownService = new turndown();
      // 简单的规则 后期考虑复用等
      const rule = [
        {
          key: 'h1',
          replace: '# ',
        },
        {
          key: 'h2',
          replace: '## ',
        },
        {
          key: 'h3',
          replace: '### ',
        },
        {
          key: 'h4',
          replace: '#### ',
        },
        {
          key: 'h5',
          replace: '##### ',
        },
        {
          key: 'h6',
          replace: '###### ',
        },
      ];
      for (const key of rule) {
        turndownService.addRule('title', {
          filter: key.key,
          replacement: content => key.replace + content,
        });
      }
      turndownService.keep([ 'figure' ]);
      const parsedCoverList = $('#main .article-inner img');
      let coverLocation = null;
      for (let i = 0; i < parsedCoverList.length; i++) {
        let originalSrc = $(parsedCoverList[i]).attr('src');

        if (!(originalSrc.includes('http'))) originalSrc = 'https://igaojin.me/' + originalSrc;
        let filename = originalSrc.split('.');
        if (typeof filename !== 'string') {
          filename = filename[filename.length - 1];
        } else filename = 'png';

        const parsedCoverUpload = './uploads/today_gaojin_' + Date.now() + `.${filename}`;
        const imgUpUrl = await this.uploadArticleImage(encodeURI(originalSrc), parsedCoverUpload);
        if (i === 0) coverLocation = imgUpUrl;
        if (imgUpUrl) {
          $(parsedCoverList[i]).attr('src', 'https://ssimg.frontenduse.top' + imgUpUrl);
        }
      }
      const articleContent = turndownService.turndown(parsedContent.toString());

      const articleObj = {
        title,
        cover: coverLocation,
        content: articleContent,
      };

      return articleObj;
    } catch (error) {
      console.log('error', error);
      return {
        title: '',
        cover: '',
        content: '导入失败,请联系管理员!',
      };
    }
  }
  generateFileName(platform, origin) {
    let suffix = origin.split('.');
    suffix = suffix[suffix.length - 1];
    return `./uploads/today_${platform}_${new Date().valueOf()}.${suffix}`;
  }
  async defaultRequest(url) {
    const rawPage = await axios({
      url,
      method: 'get',
      headers: {
        Accept: 'text / html, application/ xhtml + xml, application/ xml; q = 0.9, image / webp, image / apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
      },
    });
    return rawPage;
  }
  async handleMatters(url) {
    try {
      const rawPage = await this.defaultRequest(url);
      let { title } = await this.service.metadata.GetFromRawPage(rawPage, url);
      title = title.replace(/\s*- Matters/, '');
      const $ = cheerio.load(rawPage.data);
      const parsedContent = $('div.u-content');
      const turndownService = new turndown();
      const parsedImages = $('img');
      let coverLocation = null;
      for (const image of parsedImages.toArray()) {
        const originSrc = $(image).attr('src');
        const uploadUrl = await this.uploadArticleImage(originSrc,
          this.generateFileName('matters', originSrc));
        if (!coverLocation) { coverLocation = uploadUrl; }
        $(image).attr('src', uploadUrl ? 'https://ssimg.frontenduse.top' + uploadUrl : '');
      }
      const articleContent = turndownService.turndown(parsedContent.html());
      return {
        title,
        cover: coverLocation,
        content: articleContent,
      };

    } catch (err) {
      this.logger.error('PostImportService:: handleMatters: error:', err);
      return null;
    }
  }

  async handleZhihu(url) {
    try {
      const rawPage = await this.defaultRequest(url);
      const { title } = await this.service.metadata.GetFromRawPage(rawPage, url);
      const $ = cheerio.load(rawPage.data);
      const parsedContent = $('div.RichText.ztext.Post-RichText');
      const turndownService = new turndown();
      const parsedTitleImage = $('img.TitleImage');
      const parsedImages = $('img', parsedContent);
      const parsedLinkCards = $('a.LinkCard');
      let uploadedImgs = [];
      for (const image of parsedImages.toArray()) {
        const originSrc = $(image).attr('data-original');
        const uploadUrl = originSrc ? 'https://ssimg.frontenduse.top' + await this.uploadArticleImage(originSrc,
          this.generateFileName('zhihu', originSrc)) : null;
        $(image).attr('src', uploadUrl ? uploadUrl : '');
        uploadedImgs.push(uploadUrl);
      }
      // 防止 null 混进了里面
      uploadedImgs = uploadedImgs.filter(it => it !== null);
      let coverLocation = null;
      if (parsedTitleImage && parsedTitleImage.attr('src')) {
        const originSrc = parsedTitleImage.attr('src');
        coverLocation = await this.uploadArticleImage(originSrc,
          this.generateFileName('zhihu', originSrc));
      } else if (uploadedImgs.length !== 0) {
        coverLocation = uploadedImgs[0].replace('https://ssimg.frontenduse.top', '');
      } else {
        // Blank Cover if no pic in the post
        coverLocation = '/article/2020/03/04/7f6be16b0253c196b986e3baaaf2287a.png';
      }
      for (const linkCard of parsedLinkCards.toArray()) {
        $(linkCard).attr('target', 'linebreak'); // hack
      }
      turndownService.addRule('linkCard', {
        filter: 'a',
        replacement: (content, node) =>
          `[${content}](${node.href}) ${node.target === 'linebreak' ? '\n\n' : ''}`,
      });
      turndownService.remove('noscript');
      const articleContent = turndownService.turndown(parsedContent.html());
      return {
        title,
        cover: coverLocation,
        content: articleContent,
      };

    } catch (err) {
      this.logger.error('PostImportService:: handleZhihu: error:', err);
      return null;
    }
  }
  async handleWeibo(url) {
    try {
      const { data } = await axios({
        url: 'http://headl3ss-par53r.smartsignature.io:7333/get-weibo',
        method: 'post',
        data: { url },
      });
      const $ = cheerio.load(data);
      const title = $('div.title').text();
      const parsedTitleImage = $('img');
      const parsedContent = $('div.WB_editor_iframe_new');
      const parsedImages = $('img', parsedContent);
      let coverLocation = null;
      if (parsedTitleImage) {
        const originSrc = parsedTitleImage.attr('src');
        coverLocation = await this.uploadArticleImage(originSrc,
          this.generateFileName('weibo', originSrc));
      }
      for (const image of parsedImages.toArray()) {
        const originSrc = $(image).attr('src');
        if (originSrc) {
          const uploadUrl = 'https://ssimg.frontenduse.top' + await this.uploadArticleImage(originSrc,
            this.generateFileName('weibo', originSrc));
          $(image).attr('src', uploadUrl);
        }
      }
      const turndownService = new turndown();
      const articleContent = turndownService.turndown(parsedContent.html());
      return {
        title,
        cover: coverLocation,
        content: articleContent,
      };
    } catch (err) {
      this.logger.error('PostImportService:: handleWeibo: error:', err);
      return null;
    }
  }
  // handle Archive 获取archive.is的微信文章
  async handleArchive(url) {
    try {
      const rawPage = await this.defaultRequest(url);
      const $ = cheerio.load(rawPage.data);
      const title = $('h2#activity-name').text().trim();
      const coverLocation = null;
      const article = $('div#js_content');
      for (const image of $('img', article).toArray()) {
        const originSrc = $(image).attr('src');
        if (originSrc) {
          const uploadUrl = 'https://ssimg.frontenduse.top' + await this.uploadArticleImage(originSrc,
            this.generateFileName('archive', originSrc));
          $(image).attr('src', uploadUrl);
        }
      }
      const articleContent = pretty(article.html());
      return {
        title,
        cover: coverLocation,
        content: articleContent,
      };
    } catch (err) {
      this.logger.error('PostImportService:: handleWeibo: error:', err);
      return null;
    }
  }
}

module.exports = PostImportService;
