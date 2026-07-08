# server/Dockerfile - 情绪爆破局后端服务镜像
# 多阶段构建：builder 编译 TS，runner 仅运行 dist
#
# ⚠️ 构建上下文（docker-compose.yml 中 context）必须设为 ./auto-emotion
#    而不是 ./auto-emotion/server，因为本文件需要访问：
#      - server/package.json, server/src, server/tsconfig.json（构建期）
#      - database/migrations（迁移文件，在 server/ 外面）
#      - server/docker-entrypoint.sh（启动入口）
#    所有 COPY 源路径都是相对 ./auto-emotion 根的。

# ===== 阶段 1：builder =====
FROM node:20-alpine AS builder

# bcrypt 等原生模块在 alpine 上可能需要编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# ★ 使用国内 npm 镜像（淘宝），加速依赖安装
#    默认 registry.npmjs.org 在国内极慢，镜像每 10 分钟同步一次
RUN npm config set registry https://registry.npmmirror.com/

# 先复制依赖清单，利用 Docker 层缓存
# 注意：package.json 在 server/ 下，所以路径带 server/ 前缀
COPY server/package.json server/package-lock.json* ./

# 有 lock 用 npm ci（版本锁定），否则 fallback 到 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 复制源码并编译
COPY server/tsconfig.json ./
COPY server/src ./src

RUN npm run build

# ===== 阶段 2：runner =====
FROM node:20-alpine AS runner

WORKDIR /app

# ★ 使用国内 npm 镜像
RUN npm config set registry https://registry.npmmirror.com/

# 仅复制运行所需文件：dist 产物 + 依赖清单
# 注意：package.json 必须复制（含 type: module，否则 ESM 无法运行）
COPY --from=builder /app/dist ./dist
COPY server/package.json server/package-lock.json* ./

# 有 lock 用 npm ci（版本锁定），否则 fallback 到 npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npm cache clean --force

# ---- 数据库迁移支持 ----
# 复制迁移文件（database/migrations 在 auto-emotion/ 根下，server/ 外面）
COPY database/migrations ./migrations

# 安装 postgresql-client 用于执行迁移脚本和健康检查
RUN apk add --no-cache postgresql-client

# 运行时环境变量默认值（可被 compose/env_file 覆盖）
ENV NODE_ENV=production

EXPOSE 3000

# 启动入口脚本：等待 PostgreSQL → 执行迁移 → 启动 Node 服务
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
