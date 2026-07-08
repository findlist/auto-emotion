# server/Dockerfile - 情绪爆破局后端服务镜像
# 多阶段构建：builder 编译 TS，runner 仅运行 dist

# ===== 阶段 1：builder =====
FROM node:20-alpine AS builder

# bcrypt 等原生模块在 alpine 上可能需要编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./

# 安装全部依赖（含 devDependencies，构建期需要）
RUN npm ci

# 复制源码并编译
COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ===== 阶段 2：runner =====
FROM node:20-alpine AS runner

WORKDIR /app

# 仅复制运行所需文件：dist 产物 + 依赖清单
# 注意：package.json 必须复制（含 type: module，否则 ESM 无法运行）
COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json ./

# 仅安装生产依赖
RUN npm ci --omit=dev && npm cache clean --force

# 运行时环境变量默认值（可被 compose/env_file 覆盖）
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/app.js"]
