
## DAO_JAM

### 1. 用户身份
#### 获取身份可选项options
* GET /dao/job/options
* 响应状态码： 200
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": [
        {
            "id": 1,
            "text_english": "Designer",
            "text_chinese": null
        },
        {
            "id": 2,
            "text_english": "Programmer",
            "text_chinese": null
        },
        {
            "id": 3,
            "text_english": "Artist",
            "text_chinese": null
        },
        {
            "id": 4,
            "text_english": "Cheerleader",
            "text_chinese": null
        },
        {
            "id": 5,
            "text_english": "Manager",
            "text_chinese": null
        }
    ]
}
```

#### 获取用户身份
* GET /dao/user/job
* 响应状态码： 200
* 参数：
  - uid，用户id
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": [
        {
            "id": 1,
            "uid": 1042,
            "jid": 1,
            "value": 10,
            "created_at": "2020-03-04T10:13:37.000Z",
            "text_english": "Designer",
            "text_chinese": null
        }
    ]
}
```

#### 创建用户身份
* POST /dao/user/job
* 响应状态码： 200
* body参数：
```
{
	"creates": [{
		"jid": 1, // 身份options的id
		"value": 10 // 用户填写数值
  }]
}
```
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": 1
}
```

#### 更新用户身份
* PUT /dao/user/job
* 响应状态码： 200
* body参数：
```
{
	"jid": 1,
	"value": 10
}
```
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": 1
}
```

#### 删除用户身份
* DELETE /dao/user/job
* 响应状态码： 200
* 参数：
```
{
	"jid": 1,
	"value": 10
}
```
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": 1
}
```

### 2. 用户技能
#### 获取技能可选项options
* GET /dao/skill/options
* 响应状态码： 200
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": [
        {
            "id": 1,
            "text_english": "2d art",
            "text_chinese": null
        },
        {
            "id": 2,
            "text_english": "3d art",
            "text_chinese": null
        }
    ]
}
```

#### 获取用户技能
* GET /dao/user/skill
* 响应状态码： 200
* 参数：
  - uid，用户id
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": [
        {
            "id": 1,
            "uid": 1042,
            "sid": 1,
            "value": 10,
            "created_at": "2020-03-04T11:11:54.000Z",
            "text_english": "2d art",
            "text_chinese": null
        }
    ]
}
```

#### 创建用户技能
* POST /dao/user/skill
* 响应状态码： 200
* body参数：
```
{
	"creates": [{
		"sid": 1, // 身份options的id
		"value": 10 // 用户填写数值
  }]
}
```
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": 1
}
```

#### 更新用户技能
* POST /dao/user/skill
* 响应状态码： 200
* body参数：
```
{
	"creates": [{
		"sid": 1, // 身份options的id
		"value": 10 // 用户填写数值
  }]
}
```
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": 1
}
```

#### 删除用户技能
* POST /dao/user/skill
* 响应状态码： 200
* body参数：
```
{
	"creates": [{
		"sid": 1, // 身份options的id
		"value": 10 // 用户填写数值
  }]
}
```
* 返回内容：
```
{
    "code": 0,
    "message": "成功",
    "data": 1
}
```

