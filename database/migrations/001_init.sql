-- database/migrations/001_init.sql
-- 初始化数据库表结构（按外键依赖顺序创建）

-- 1. users（用户表）
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    avatar_url VARCHAR(500),
    experience INT DEFAULT 0,
    gold INT DEFAULT 0,
    gems INT DEFAULT 0,
    power INT DEFAULT 0,
    battle_score INT DEFAULT 0,
    speed_score INT DEFAULT 0,
    pvp_points INT DEFAULT 0,
    status INT DEFAULT 0,
    season_level INT DEFAULT 1,
    season_exp INT DEFAULT 0,
    is_premium BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. characters（角色表，1:1 关联 users）
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname VARCHAR(50),
    level INT DEFAULT 1,
    exp INT DEFAULT 0,
    area_id INT DEFAULT 1,
    weapon_id INT DEFAULT 1,
    hp INT DEFAULT 100,
    attack INT DEFAULT 10,
    defense INT DEFAULT 5,
    crit_rate DECIMAL(5,2) DEFAULT 0.10,
    crit_damage DECIMAL(5,2) DEFAULT 1.50,
    efficiency DECIMAL(5,2) DEFAULT 1.00,
    idle_since TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    offline_exp INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. idle_areas（挂机区域配置表）
CREATE TABLE IF NOT EXISTS idle_areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    required_level INT DEFAULT 1,
    exp_rate DECIMAL(5,2) DEFAULT 1.00,
    gold_rate DECIMAL(5,2) DEFAULT 1.00,
    drop_rate DECIMAL(5,2) DEFAULT 1.00,
    stress_reduction DECIMAL(5,2) DEFAULT 0.10,
    bg_color VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初始化挂机区域数据
INSERT INTO idle_areas (name, description, required_level, exp_rate, gold_rate, drop_rate, stress_reduction, bg_color) VALUES
('加班解压室', '键盘敲击声陪伴，代码如瀑布流淌', 1, 1.0, 1.0, 1.0, 0.05, '#FF6B9D'),
('KPI 击破场', '数字在空气中粉碎，压力变成分数', 5, 1.5, 1.2, 1.2, 0.08, '#C44EFF'),
('堵车释放区', '喇叭声与刹车声交织，混乱中的宁静', 10, 2.0, 1.5, 1.5, 0.10, '#FFB347'),
('催婚突围战', '亲戚的唠叨变成弹跳的弹珠，一触即爆', 15, 2.5, 2.0, 2.0, 0.12, '#FF6961'),
('房贷解压山', '每月一串数字，山顶的风最清爽', 20, 3.0, 2.5, 2.5, 0.15, '#77DD77');

-- 4. weapons（武器配置表）
CREATE TABLE IF NOT EXISTS weapons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_attack INT DEFAULT 10,
    base_crit_rate DECIMAL(5,2) DEFAULT 0.10,
    base_crit_damage DECIMAL(5,2) DEFAULT 1.50,
    unlock_cost_gold INT DEFAULT 0,
    icon_key VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. user_weapons（用户武器表）
CREATE TABLE IF NOT EXISTS user_weapons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weapon_id INT NOT NULL REFERENCES weapons(id),
    level INT DEFAULT 1,
    is_equipped BOOLEAN DEFAULT FALSE,
    exp INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, weapon_id)
);

-- 6. skills（技能配置表）
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    cooldown INT DEFAULT 10,
    unlock_level INT DEFAULT 1,
    damage_multiplier DECIMAL(5,2) DEFAULT 1.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. user_skills（用户技能表）
CREATE TABLE IF NOT EXISTS user_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id INT NOT NULL REFERENCES skills(id),
    level INT DEFAULT 1,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, skill_id)
);

-- 8. pets（宠物配置表）
CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    bonus_type VARCHAR(50),
    bonus_value DECIMAL(5,2) DEFAULT 0.00,
    unlock_cost_gold INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. user_pets（用户宠物表）
CREATE TABLE IF NOT EXISTS user_pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pet_id INT NOT NULL REFERENCES pets(id),
    is_equipped BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, pet_id)
);

-- 10. game_records（游戏记录表）
CREATE TABLE IF NOT EXISTS game_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(20) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    duration_seconds INT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    total_score BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. game_record_players（游戏记录玩家表）
CREATE TABLE IF NOT EXISTS game_record_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES game_records(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    nickname VARCHAR(50),
    score BIGINT DEFAULT 0,
    rank INT,
    damage BIGINT DEFAULT 0,
    is_mvp BOOLEAN DEFAULT FALSE,
    exp_reward INT DEFAULT 0,
    gold_reward INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. shop_items（商城物品表）
CREATE TABLE IF NOT EXISTS shop_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    price_gold INT,
    price_real INT,
    effect_type VARCHAR(50),
    effect_value DECIMAL(10,2),
    stock INT DEFAULT -1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. user_items（用户物品表）
CREATE TABLE IF NOT EXISTS user_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES shop_items(id),
    quantity INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

-- 14. friendships（好友关系表）
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- 15. daily_tasks（每日任务配置表）
CREATE TABLE IF NOT EXISTS daily_tasks (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type INT DEFAULT 0,
    target INT DEFAULT 1,
    reward_exp INT DEFAULT 10,
    reward_gold INT DEFAULT 10,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. user_daily_tasks（用户每日任务表）
CREATE TABLE IF NOT EXISTS user_daily_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INT NOT NULL REFERENCES daily_tasks(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    progress INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, task_id, date)
);

-- 17. achievements（成就配置表）
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type INT DEFAULT 0,
    target INT DEFAULT 1,
    reward_type VARCHAR(50) DEFAULT 'skin',
    reward_id INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 18. user_achievements（用户成就表）
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INT NOT NULL REFERENCES achievements(id),
    progress INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    claimed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- 19. seasons（赛季表）
CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 20. season_passes（赛季通行证配置表）
CREATE TABLE IF NOT EXISTS season_passes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    season VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reward_exp INT DEFAULT 1000,
    reward_gold INT DEFAULT 500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 21. user_season_passes（用户赛季通行证表）
CREATE TABLE IF NOT EXISTS user_season_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season_pass_id INT NOT NULL REFERENCES season_passes(id),
    level INT DEFAULT 1,
    exp INT DEFAULT 0,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, season_pass_id)
);

-- 22. user_season_rewards（用户赛季奖励表）
CREATE TABLE IF NOT EXISTS user_season_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season_id INT NOT NULL DEFAULT 0,
    level INT NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, season_id, level, is_premium)
);

-- 23. user_inventory（用户背包表）
CREATE TABLE IF NOT EXISTS user_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL,
    item_id INT NOT NULL,
    quantity INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, item_type, item_id)
);

-- ==================== 初始化配置数据 ====================

-- 武器数据
INSERT INTO weapons (name, description, base_attack, base_crit_rate, base_crit_damage, unlock_cost_gold, icon_key) VALUES
('泡泡枪', '发射彩色泡泡，可爱又解压', 10, 0.10, 1.50, 0, 'bubble_gun'),
('压力炮', '高压喷射，瞬间释放', 15, 0.08, 1.80, 500, 'pressure_cannon'),
('情绪榴弹', '爆炸式解压，一发入魂', 20, 0.12, 2.00, 1500, 'emotion_grenade'),
('焦虑霰弹', '多弹齐发，全面覆盖', 25, 0.15, 1.60, 3000, 'anxiety_shotgun'),
('崩溃火箭', '终极解压武器', 35, 0.10, 2.50, 10000, 'crash_rocket')
ON CONFLICT DO NOTHING;

-- 技能数据
INSERT INTO skills (name, description, type, cooldown, unlock_level, damage_multiplier) VALUES
('泡泡护盾', '用泡泡包裹自己，减少受到的伤害', 'passive', 0, 1, 1.20),
('压力吸收', '吸收周围的压力转化为攻击力', 'passive', 0, 5, 1.30),
('情绪爆发', '积蓄的情绪瞬间爆发，造成大量伤害', 'active', 15, 10, 2.00),
('焦虑光环', '释放焦虑光环，降低敌人攻击力', 'active', 20, 15, 0.80),
('崩溃领域', '创造一个崩溃领域，持续伤害所有敌人', 'active', 30, 20, 3.00)
ON CONFLICT DO NOTHING;

-- 宠物数据
INSERT INTO pets (name, description, bonus_type, bonus_value, unlock_cost_gold) VALUES
('小喵', '可爱的猫咪，攻击时附带喵喵攻击', 'attack', 0.05, 0),
('小柴', '忠诚的柴犬，增加暴击率', 'crit_rate', 0.03, 500),
('小熊', '憨厚的熊，增加防御力', 'defense', 0.10, 1000),
('小鹰', '翱翔的鹰，增加攻击速度', 'speed', 0.15, 2000),
('小狐', '聪明的狐狸，减少技能冷却', 'cooldown', 0.10, 5000)
ON CONFLICT DO NOTHING;

-- 商城物品数据
INSERT INTO shop_items (name, description, type, price_gold, price_real, effect_type, effect_value) VALUES
('挂机加速卡(1小时)', '挂机效率提升50%', 'item', 100, 0, 'idle_speed', 0.50),
('挂机加速卡(1天)', '挂机效率提升100%', 'item', 500, 0, 'idle_speed', 1.00),
('经验药水', '使用后获得1000经验', 'item', 200, 0, 'exp', 1000),
('体力恢复药水', '恢复50体力', 'item', 150, 0, 'stamina', 50),
('泡泡枪皮肤', '可爱的泡泡枪外观', 'weapon_skin', 1000, 0, NULL, NULL),
('彩虹泡泡皮肤', '彩虹色的泡泡枪', 'weapon_skin', 2000, 0, NULL, NULL),
('小喵宠物蛋', '可孵化出小喵宠物', 'pet', 3000, 0, NULL, NULL),
('小柴宠物蛋', '可孵化出小柴宠物', 'pet', 3000, 0, NULL, NULL),
('传说宠物蛋', '可孵化出传说宠物', 'pet', 10000, 0, NULL, NULL)
ON CONFLICT DO NOTHING;

-- 成就数据
INSERT INTO achievements (code, name, description, type, target, reward_type, reward_id) VALUES
('first_battle', '初次解压', '完成首局对战', 0, 1, 'skin', 1),
('battle_10', '解压新手', '累计10局对战', 0, 10, 'skin', 1),
('battle_100', '百战不殆', '累计100局对战', 0, 100, 'pet', 3),
('battle_500', '千战千胜', '累计500局对战', 0, 500, 'skin', 5),
('destroy_1000', '破坏之王', '累计破坏1000物品', 1, 1000, 'weapon_skin', 1),
('destroy_10000', '毁灭者', '累计破坏10000物品', 1, 10000, 'weapon_skin', 3),
('idle_10h', '挂机新手', '累计挂机10小时', 2, 10, 'item', 1),
('idle_100h', '挂机大师', '累计挂机100小时', 2, 100, 'item', 2),
('friends_10', '社交达人', '拥有10个好友', 3, 10, 'skin', 2),
('level_50', '50级玩家', '角色等级达到50级', 4, 50, 'pet', 2),
('power_10000', '万战力', '战力达到10000', 5, 10000, 'weapon_skin', 2)
ON CONFLICT DO NOTHING;

-- 创建当前赛季
INSERT INTO seasons (name, started_at, ends_at) VALUES
('第1赛季', NOW(), NOW() + INTERVAL '28 days')
ON CONFLICT DO NOTHING;

-- 外键索引
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_weapons_user_id ON user_weapons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_weapons_weapon_id ON user_weapons(weapon_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pets_user_id ON user_pets(user_id);
CREATE INDEX IF NOT EXISTS idx_game_records_room_id ON game_records(room_id);
CREATE INDEX IF NOT EXISTS idx_game_record_players_record_id ON game_record_players(record_id);
CREATE INDEX IF NOT EXISTS idx_game_record_players_user_id ON game_record_players(user_id);
CREATE INDEX IF NOT EXISTS idx_user_items_user_id ON user_items(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(date);
CREATE INDEX IF NOT EXISTS idx_user_daily_tasks_user_id ON user_daily_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_tasks_date ON user_daily_tasks(date);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_season_passes_dates ON season_passes(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_user_season_rewards_user_id ON user_season_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON user_inventory(user_id);
