# client/Dockerfile - 情绪爆破局前端服务镜像
# 多阶段构建：builder 用 Vite 打包，runner 用 nginx 托管静态资源

# ===== 阶段 1：builder =====
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./

RUN npm ci

# 复制源码并打包
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# ===== 阶段 2：runner =====
FROM nginx:alpine AS runner

# 复制 nginx 自定义配置（SPA fallback + 反向代理）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物到 nginx 静态目录
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
