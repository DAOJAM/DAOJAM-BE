# Posts API 文档

### 搜索已经关注的用户发的文章

- 路径： /posts/followedPosts
- 请求方式： GET
- Header： 默认
- 参数：
  
| 参数名 | 类型 | 是否必须 | 说明 | 位置 |
|---|---|---|---|---|
| page | int | Flase | 页码 | Query |
| pagesize | int | Fasle | 每页的条数 | Query |
| channel | int | False | 文章的频道， 1为普通文章， 2为商品 | Query |
| extra | string | False | 额外的信息， 以逗号隔开 | Query |

- 请求示例：

```
curl -X GET 'http://apitest.smartsignature.io/posts/followedPosts?pagesize=2&extra=short_content&channel=2&page=2' 
```

- 返回示例：

```
{
    "code": 0,
    "message": "成功",
    "data": {
        "count": 68,
        "list": [
            {
                "id": 100702,
                "uid": 207,
                "author": "fromnrttolax",
                "title": "ProofofLife：为什么说比特币是一种生命体？",
                "short_content": "如何证明读文章的你不是一段代码？",
                "hash": "QmYQcJViXawLhJJKoDY5BoaYppFB3dq976hFLcamNMgeR7",
                "create_time": "2019-08-16T05:46:29.000Z",
                "cover": "/image/2019/08/16/82c99da533512b4b3bb10370f6caa954.jpg",
                "nickname": "from",
                "avatar": "/avatar/2019/07/12/b8fea8566aa0b6341060c37410ea628b.png",
                "read": 15,
                "eosvalue": 0,
                "ups": 0,
                "ontvalue": 0,
                "tags": [],
                "sale": 0
            }
        ]
    }
}
```

### 全文搜索功能

- 路径： /posts/search
- 请求方式： GET
- Header： 默认
- 参数：
  
| 参数名 | 类型 | 是否必须 | 说明 | 位置 |
|---|---|---|---|---|
| word | string | True | 搜索关键词 | Query |
| channel | int | False | 文章的频道， 1为文章， 2为商品， 没有则为全部 | Query |
| page | int | False | 页码 | Query |
| pagesize | int | False | 每页的条目数 | Query |

- 请求示例：

```
curl -X GET 'https://apitest.smartsignature.io/posts/search?type=post&word=%E4%BB%B7%E5%80%BC&channel=1&page=1&pagesize=10'
```

- 返回示例：
```
{
    "code": 0,
    "message": "成功",
    "data": {
        "count": 51,
        "list": [
            {
                "id": 100683,
                "uid": 1055,
                "author": "AUD4eZPoqq5kTDxDUnnu3PLLpPFamTwyfn",
                "title": "美国大选华裔候选人杨安泽说了，数据比石油更有<em>价值</em>，但如何实现它？",
                "short_content": "这是当我们讨论数据所有权和数据<em>价值</em>时，第一件、或许也是最重要需要理解的事情：我们不能通过出售数据实现数据<em>价值</em>，只能通过出售数据结果实现数据<em>价值</em>。...,
                "hash": "QmNXih3LLpuJcKobS1gfbLWvQEQttmC95Cj1ncnoTGmKUs",
                "create_time": "2019-08-16T02:03:12.000Z",
                "cover": "/image/2019/08/16/5aae5c967bf99912d1f322c2104c5991.jpg",
                "nickname": null,
                "avatar": null,
                "read": 4,
                "eosvalue": 0,
                "ups": 0,
                "ontvalue": 0,
                "tags": [
                    {
                        "id": 2,
                        "name": "认真脑洞",
                        "type": "post"
                    }
                ],
                "sale": 0
            }
        ]
    }
}
```

