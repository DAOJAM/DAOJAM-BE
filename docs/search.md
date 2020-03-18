# Search API 文档

### 推荐搜索词

- 路径： /search/recommand
- 请求方式： GET
- Header： 默认
- 参数：
  
| 参数名 | 类型 | 是否必须 | 说明 | 位置 |
|---|---|---|---|---|
| amount | int | False | 返回的词数量， 默认为5 | Query |
| area | int | False | 词语是对文章的搜索或用户的搜索， 1为文章， 3为用户 | Query |

- 请求示例：

```
curl -X GET 'http://localhost:7001/search/recommand?amount=3&area=1' 
```

- 返回示例：

```
{
    "code": 0,
    "message": "成功",
    "data": [
        {
            "word": "市场"
        }
    ]
}
```