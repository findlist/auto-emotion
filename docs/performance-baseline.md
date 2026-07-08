# 性能基线文档

## 测试环境

- 服务器配置：[待填写]
- 数据库：PostgreSQL 15
- 缓存：Redis 7

## 性能指标

| 接口 | P95 目标 | 实测 P95 | 错误率目标 | 实测错误率 | QPS |
|------|----------|----------|------------|------------|-----|
| 登录 | < 500ms | [待测] | < 1% | [待测] | [待测] |
| 匹配 | < 500ms | [待测] | < 1% | [待测] | [待测] |
| 结算 | < 500ms | [待测] | < 1% | [待测] | [待测] |
| 挂机收益 | < 500ms | [待测] | < 1% | [待测] | [待测] |

## 接口详情

### 登录接口

- 路径：`POST /api/auth/login`
- 请求参数：
  ```json
  {
    "phone": "string (11-20位)",
    "password": "string (1-50位)"
  }
  ```
- 响应格式：
  ```json
  {
    "code": 0,
    "data": {
      "token": "string",
      "refreshToken": "string",
      "user": { "id": "string", "nickname": "string" }
    }
  }
  ```

### 匹配接口

- 路径：`POST /api/match/quick`
- 请求头：`Authorization: Bearer <token>`
- 请求参数：
  ```json
  {
    "nickname": "string",
    "socketId": "string"
  }
  ```
- 响应格式：
  ```json
  {
    "code": 0,
    "data": { "matchId": "string", "status": "waiting" }
  }
  ```

### 结算接口

- 路径：`POST /api/settle`
- 请求头：`Authorization: Bearer <token>`
- 请求参数：
  ```json
  {
    "roomId": "string",
    "mode": "string",
    "durationSeconds": 180,
    "players": [
      {
        "userId": "string",
        "nickname": "string",
        "score": 1000,
        "damage": 5000,
        "stressKeywords": ["string"]
      }
    ]
  }
  ```
- 响应格式：
  ```json
  {
    "code": 0,
    "data": {
      "success": true,
      "rewards": [
        { "userId": "string", "exp": 150, "gold": 70, "points": 30 }
      ]
    }
  }
  ```

### 挂机收益接口

- 路径：`GET /api/idle/status`
- 请求头：`Authorization: Bearer <token>`
- 响应格式：
  ```json
  {
    "code": 0,
    "data": {
      "level": 1,
      "exp": 0,
      "hp": 100,
      "attack": 10,
      "defense": 5,
      "areaId": 1
    }
  }
  ```

## 运行方法

```bash
# 使用默认地址 http://localhost:3000
k6 run server/scripts/load-test.js

# 指定服务地址
BASE_URL=http://your-server:3000 k6 run server/scripts/load-test.js
```

## 压测配置

- 升压阶段：30秒，目标 20 并发用户
- 稳定阶段：1分钟，维持 20 并发用户
- 降压阶段：30秒，降至 0 并发用户
- P95 响应时间阈值：500ms
- 错误率阈值：1%

## 优化建议

[根据测试结果填写]
