#!/bin/sh
# ============================================================
#  情绪爆破局 — 容器启动入口脚本
#  流程：等待 PostgreSQL 就绪 → 执行迁移 → 启动 Node 服务
#
#  设计参考 auto-community 的成熟方案，保持一致的运维体验。
#  迁移文件位于容器内 /app/migrations/，由 Dockerfile 从
#  源码 database/migrations/ 复制进来。
# ============================================================
set -e

echo "[emotion] 等待 PostgreSQL 就绪..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q; do
  echo "[emotion] 数据库未就绪，3 秒后重试..."
  sleep 3
done
echo "[emotion] PostgreSQL 已就绪"

# 按文件名顺序执行所有迁移文件（文件名已用 001_、002_ 前缀编号）
for sql_file in /app/migrations/*.sql; do
  if [ -f "$sql_file" ]; then
    echo "[emotion] 迁移: 执行 $(basename "$sql_file") ..."
    PGPASSWORD="$DB_PASSWORD" psql \
      -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
      -d "$DB_NAME" \
      -f "$sql_file" \
      -v ON_ERROR_STOP=1
    echo "[emotion] 迁移: $(basename "$sql_file") 完成"
  fi
done
echo "[emotion] 所有迁移文件执行完毕"

echo "[emotion] 启动 Node 服务..."
exec node dist/app.js
