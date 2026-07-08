-- database/migrations/003_add_query_indexes.sql
-- 高频查询字段索引优化
-- 设计原因：001_init.sql 仅在 user_id/外键维度建索引，遗漏了排行榜排序、状态过滤、
-- 复合条件查询等高频路径。本迁移针对 leaderboard-service / friend-service / task-service /
-- shop-service 等核心查询补齐索引，避免用户量增长后全表扫描+排序导致接口变慢。

-- ==================== users 表：排行榜查询 ====================
-- 设计原因：leaderboard-service.getLeaderboard 按 status=0 过滤 + 排序字段倒序分页。
-- 使用部分索引（WHERE status = 0）仅索引活跃用户，索引体积更小、查询直接命中。
-- 三个排行榜（战力/对战/速度）独立索引，避免相互干扰。
CREATE INDEX IF NOT EXISTS idx_users_power_rank ON users (power DESC) WHERE status = 0;
CREATE INDEX IF NOT EXISTS idx_users_battle_score_rank ON users (battle_score DESC) WHERE status = 0;
CREATE INDEX IF NOT EXISTS idx_users_speed_score_rank ON users (speed_score DESC) WHERE status = 0;

-- ==================== friendships 表：好友列表与请求查询 ====================
-- 设计原因：friend-service 多个查询按 user_id+status 或 friend_id+status 过滤。
-- 现有 idx_friendships_user_id / idx_friendships_friend_id 仅单列索引，
-- 加 status 后可走索引下推（Index Cond），减少回表行数。
CREATE INDEX IF NOT EXISTS idx_friendships_user_status ON friendships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_status ON friendships (friend_id, status);

-- ==================== daily_tasks 表：任务类型查询 ====================
-- 设计原因：task-service.updateTaskProgress 按 date+type 过滤当日某类型任务，
-- 现有 idx_daily_tasks_date 仅 date 单列，加 type 后复合索引覆盖该查询。
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date_type ON daily_tasks (date, type);

-- ==================== user_daily_tasks 表：用户当日任务查询 ====================
-- 设计原因：task-service.getDailyTasks 按 user_id+date 查询用户当日任务进度，
-- 现有 idx_user_daily_tasks_user_id 与 idx_user_daily_tasks_date 是两个独立单列索引，
-- PostgreSQL 优化器虽可位图合并但代价更高，复合索引可直接命中。
CREATE INDEX IF NOT EXISTS idx_user_daily_tasks_user_date ON user_daily_tasks (user_id, date);

-- ==================== user_inventory 表：用户背包查询 ====================
-- 设计原因：shop-service.getUserItems 按 user_id 过滤后按 item_type 排序，
-- 现有 idx_user_inventory_user_id 仅 user_id，加 item_type 后排序可走索引避免 filesort。
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_type ON user_inventory (user_id, item_type);
