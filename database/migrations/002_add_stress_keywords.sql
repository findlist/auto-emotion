-- database/migrations/002_add_stress_keywords.sql
-- 为 game_record_players 添加压力关键词字段，用于情绪压力雷达图统计

ALTER TABLE game_record_players
ADD COLUMN IF NOT EXISTS stress_keywords TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_game_record_players_stress_keywords
ON game_record_players USING GIN (stress_keywords);
