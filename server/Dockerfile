# server/Dockerfile - 情绪爆破局后端服务镜像
# 多阶段构建：builder 编译 TS + 安装生产依赖，runner 直接复用
#
# ⚠️ 构建上下文（docker-compose.yml 中 context）必须设为 ./auto-emotion
#    因为本文件需要访问：
#      - server/package.json, server/src, server/tsconfig.json（构建期）
#      - database/migrations（迁移文件，在 server/ 外面）
#      - server/docker-entrypoint.sh（启动入口）

# ===== 阶段 1：builder =====
FROM node:20-alpine AS builder

# bcrypt 等原生模块在 alpine 上需要编译工具（musl 无预编译二进制）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# ★ 使用国内 npm 镜像（淘宝），加速依赖安装
RUN npm config set registry https://registry.npmmirror.com/

# 先复制依赖清单，利用 Docker 层缓存
COPY server/package.json server/package-lock.json* ./

# 先装全部依赖（含 devDeps）用于编译 TS
# --no-fund/--no-audit 跳过资金提示和安全审计，加速安装
RUN npm ci --no-fund --no-audit

# 复制源码并编译
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# 重新只装生产依赖（含 bcrypt 编译产物），后续整体复制给 runner
# 这样 runner 阶段无需再装编译工具，也无需再次 npm ci
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force

# ===== 阶段 2：runner =====
FROM node:20-alpine AS runner

WORKDIR /app

# 直接复用 builder 已装好的生产依赖（含 bcrypt 已编译的 .node 二进制）
# 避免在 runner 阶段重复 npm ci，否则需再装 python3/make/g++ 才能编译 bcrypt
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# package.json 必须复制（含 type: module，否则 ESM 无法运行）
COPY server/package.json ./

# ---- 数据库迁移支持 ----
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
