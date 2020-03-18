<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>JS Bin</title>
</head>
<body>
<div style="width: 530px;background:#eaeaea;padding: 10px 20px;border:2px solid #eaeaea;border-radius:10px;-moz-border-radius:10px;box-shadow: 5px 5px 5px #b2b2b2;">
  <div style="width: 520px;padding: 0px 0px;">
	<p style="text-align:left;">
		<img src="https://i.imgur.com/8nBjUZD.png" alt="" width="50%" /> 
	</p>
  </div>
	<h1>
		<span style="color:#337FE5;">{{ username }} 您好</span><span> </span> 
	</h1>
<strong><span style="font-family:Microsoft YaHei;">感谢您近期在 <a href="https://smartsignature.io" target="_blank">瞬Matataki</a> 上的交易！</span></strong><br />
<br />
<span style="font-family:Microsoft YaHei;"> 您购买的 {{ productamount }}份 {{ productname }}&nbsp; 已添加到您的 瞬Matataki 购买记录中。</span><br />
<span style="font-family:Microsoft YaHei;"> 您可以在 瞬Matataki 中对应的商品页面中找到相应的商品信息。</span><br />
	<p>
		<br/>
	</p>
	<p style="font-family:&quot;">
		{% if category == 1 %}
			<span style="font-family:&quot;"><span style="font-family:Microsoft YaHei;">您需要在 Steam 中使用激活码来游玩 {{ productname }} 。</span> <br />
			<span style="font-family:&quot;"><span style="font-family:Microsoft YaHei;">如果您未曾使用过 Steam，您可以</span><a href="https://store.steampowered.com/" target="_blank"><span style="font-family:Microsoft YaHei;">在此</span></a><span style="font-family:Microsoft YaHei;">获得免费的 Steam 程序。</span></span> 
		{% elif category == 2 %}
			<span style="font-family:&quot;"><span style="font-family:Microsoft YaHei;">您可以在 {{ productname }} 中输入以下的激活码来使用/游玩 。</span> <br />
		{% elif category == 3 %}
			<span style="font-family:&quot;"><span style="font-family:Microsoft YaHei;">您可以访问下面商品信息中的链接, 前往百度网盘来下载 {{ productname }} 。</span> <br />
		{% endif %}
	</p>
	<p>
		<br/>
	</p>
	<div style="width: 510px;background:#dedede;padding: 4px 10px 14px;border:0px solid;border-radius:10px;-moz-border-radius:10px;">
	  <p>
      <h2>
		<span style="font-family:Microsoft YaHei;">商品信息：</span> 
      </h2>
	</p>
	<p>
		<span style="font-size: 20px; "><span style="font-family:Microsoft YaHei;">商品名：{{ productname }}</span>
	</p>
	<p>
		<span style="font-size: 20px; "><span style="font-family:Microsoft YaHei;">数量：{{ productamount }}</span> 
	</p>
	<p>
		{% if category == 1 %}
			<span style="font-size: 20px;"><span style="font-family:Microsoft YaHei;">Steam激活码：</span>
		{% elif category == 2 %}
			<span style="font-size: 20px;"><span style="font-family:Microsoft YaHei;">激活码：</span>
		{% elif category == 3 %}
			<span style="font-size: 20px;"><span style="font-family:Microsoft YaHei;">链接：</span>
		{% endif %}
		{% for stock in stocks %}
			<br><span style="font-size: 20px;"><span style="font-family:Microsoft YaHei;">{{ stock.digital_copy }}</span>
		{% endfor %}
	</p>
    <br />
    <br />
     <br />
    <span style="font-family:Microsoft YaHei;"> 帐户名称：{{ username }}</span><span> </span><br />
    <span style="font-family:Microsoft YaHei;"> 共支付：{{ totalprice }} {{ symbol }}</span><br />
    <!-- <span style="font-family:Microsoft YaHei;"> 交易哈希 </span><span> </span><br /> -->
    <span style="font-family:Microsoft YaHei;"> 创建日期：{{ time }} 北京时间</span><span> </span><br />
    <span style="font-family:Microsoft YaHei;"> 支付方式： {{ symbol }} 钱包</span><span> </span><br />
    <span style="font-family:Microsoft YaHei;"> 
      	</div>

	<div>
		<span style="font-family:Microsoft YaHei;"><br />
</span> 
	</div>
</span> 
	<p>
		<span style="font-family:Microsoft YaHei;color:#666666;"> 这封电子邮件将作为您的收据。您可以随时查看您的消费历史记录。</span> 
	</p>
<br />
<span style="font-family:Microsoft YaHei;color:#666666;"> 瞬Matataki官方邮箱：</span><br />
<span style="font-family:Microsoft YaHei;color:#666666;"> socialmedia@andoromeda.io</span><br />
<span style="font-family:Microsoft YaHei;color:#666666;"> 瞬Matataki微信号：</span><br />
<span style="font-family:Microsoft YaHei;color:#666666;"> DAppsDev</span> 
  <div style="width: 520px;background:#;padding: 0px 5px;">
	<p style="text-align:justify;">
		<img src="https://i.imgur.com/EnCyqPC.png" alt="" width="40%" style="float: left;"  /> 

		<img src="https://i.imgur.com/GNtnLUg.png" alt="" width="15%" style="float: right;" /> 
      <div style="clear: both;"></div>
	</p>

</div>
</body>

</html>