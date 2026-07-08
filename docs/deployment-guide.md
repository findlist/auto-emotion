# 部署运维手册

## 1. 环境要求

- Docker 20.10+
- Docker Compose 2.0+
- 最低 2核4G 内存

## 2. 服务架构

本项目采用 Docker Compose 编排，包含以下 4 个服务：

| 服务 | 容器名 | 镜像 | 端口 | 说明 |
|------|--------|------|------|------|
| PostgreSQL | emotion-postgres | postgres:16-alpine | 5432 | 数据库服务 |
| Redis | emotion-redis | redis:7-alpine | 6379 | 缓存服务 |
| Server | emotion-server | 自构建 | 3000 | 后端 API 服务 |
| Client | emotion-client | 自构建 | 80 | 前端静态资源 |

服务依赖关系：Server 依赖 PostgreSQL 和 Redis（健康检查通过后启动），Client 依赖 Server。

## 3. 环境变量说明

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| PORT | 服务端口 | 3000 | 否 |
| NODE_ENV | 运行环境 | development | 否 |
| JWT_SECRET | JWT 签名密钥 | - | 是 |
| DB_HOST | PostgreSQL 主机 | postgres | 否 |
| DB_PORT | PostgreSQL 端口 | 5432 | 否 |
| DB_USER | PostgreSQL 用户名 | emotion | 否 |
| DB_PASSWORD | PostgreSQL 密码 | - | 是 |
| DB_NAME | PostgreSQL 数据库名 | emotion_burst | 否 |
| REDIS_HOST | Redis 主机 | redis | 否 |
| REDIS_PORT | Redis 端口 | 6379 | 否 |
| AI_API_KEY | AI 服务 API 密钥 | - | 是 |
| AI_API_URL | AI 服务 API 地址 | - | 是 |

## 4. 一键部署

```bash
# 克隆代码
git clone [repo]
cd treaaigame

# 配置环境变量
cp .env.example .env
vim .env

# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps
```

## 5. 健康检查

- **PostgreSQL**：`docker-compose exec postgres pg_isready -U emotion`
- **Redis**：`docker-compose exec redis redis-cli ping`
- **Server**：`curl http://localhost:3000/health`

> Docker Compose 已内置健康检查配置，PostgreSQL 和 Redis 每 10 秒检测一次，失败 5 次后标记为不健康。

## 6. 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看后端服务日志
docker-compose logs -f server

# 查看数据库日志
docker-compose logs -f postgres

# 过滤错误日志
docker-compose logs server | grep ERROR
```

## 7. 数据持久化

PostgreSQL 数据通过 Docker Volume `postgres_data` 持久化存储。

```bash
# 查看数据卷
docker volume ls | grep postgres_data

# 备份数据库
docker-compose exec postgres pg_dump -U emotion emotion_burst > backup.sql

# 恢复数据库
docker-compose exec -T postgres psql -U emotion emotion_burst < backup.sql
```

## 8. 扩容建议

- **垂直扩容**：增加 CPU/内存，适用于初期阶段
- **水平扩容**：部署多个 server 实例 + Nginx 负载均衡
- **数据库**：读写分离、连接池优化
- **Redis**：集群模式，适用于高并发场景

## 9. 故障排查

| 问题 | 排查方法 | 解决方案 |
|------|----------|----------|
| 服务无法启动 | `docker-compose logs server` | 检查环境变量配置是否完整 |
| 数据库连接失败 | 检查 DB_HOST、DB_PASSWORD 等配置 | 确认 PostgreSQL 容器健康运行 |
| Redis 连接失败 | 检查 REDIS_HOST、REDIS_PORT 配置 | 确认 Redis 容器健康运行 |
| AI 生成失败 | 检查 AI_API_KEY 和 AI_API_URL | 更新 API 密钥或地址 |
| 端口冲突 | `netstat -ano | findstr :5432` | 修改端口映射或停止冲突服务 |

## 10. 常用运维命令

```bash
# 停止所有服务
docker-compose down

# 停止并删除数据卷（慎用）
docker-compose down -v

# 重新构建并启动
docker-compose up -d --build

# 进入容器调试
docker-compose exec server sh
docker-compose exec postgres psql -U emotion emotion_burst
docker-compose exec redis redis-cli
```