// server/src/ai/dict/stress-keywords.ts
// 压力关键词词典：每个关键词对应一种怪兽模板
// 怪兽生成器根据输入关键词匹配条目，填充 nameSuffix / 技能 / 弱点 / 外观等字段

// 技能类型：attack 直接伤害、debuff 减益、summon 召唤
export type SkillType = 'attack' | 'debuff' | 'summon';

// 技能模板：生成怪兽技能时使用的原型
export interface SkillTemplate {
  name: string;
  type: SkillType;
  effect: string;
  cooldown: number;
}

// 压力关键词条目：定义该关键词对应的怪兽外观与技能池
export interface StressKeywordEntry {
  keyword: string;
  nameSuffix: string;
  avatar: string;
  skillTemplates: SkillTemplate[];
  weaknessTemplate: string;
  color: string;
  shape: string;
}

// 压力关键词词典：覆盖 10 个职场/生活压力关键词
// 每个关键词配置 2-3 个技能模板供生成器随机选取
export const stressKeywords: StressKeywordEntry[] = [
  {
    keyword: '加班',
    nameSuffix: '噩梦兽',
    avatar: '💼',
    skillTemplates: [
      { name: 'deadline 倒计时', type: 'debuff', effect: '减速 30%', cooldown: 8 },
      { name: '无尽需求', type: 'summon', effect: '召唤小怪', cooldown: 12 },
      { name: '通宵爆肝', type: 'attack', effect: '持续掉血', cooldown: 10 },
    ],
    weaknessTemplate: '被连击 10 次眩晕',
    color: '#FF3D7F',
    shape: 'square',
  },
  {
    keyword: 'KPI',
    nameSuffix: '考核兽',
    avatar: '📊',
    skillTemplates: [
      { name: '末位淘汰', type: 'debuff', effect: '降低攻击力 20%', cooldown: 10 },
      { name: '数据狂潮', type: 'attack', effect: '范围伤害', cooldown: 8 },
      { name: '月度复盘', type: 'debuff', effect: '眩晕 2 秒', cooldown: 15 },
    ],
    weaknessTemplate: '被精准打击 3 次暴击',
    color: '#FF6B35',
    shape: 'triangle',
  },
  {
    keyword: '堵车',
    nameSuffix: '蜗牛兽',
    avatar: '🚗',
    skillTemplates: [
      { name: '龟速前行', type: 'debuff', effect: '减速 50%', cooldown: 6 },
      { name: '喇叭轰炸', type: 'attack', effect: '噪音伤害', cooldown: 5 },
      { name: '追尾连锁', type: 'summon', effect: '召唤路障', cooldown: 10 },
    ],
    weaknessTemplate: '被冲刺技能击穿',
    color: '#4ECDC4',
    shape: 'circle',
  },
  {
    keyword: '催婚',
    nameSuffix: '红娘兽',
    avatar: '💍',
    skillTemplates: [
      { name: '七大姑八大姨', type: 'summon', effect: '召唤亲戚', cooldown: 12 },
      { name: '灵魂拷问', type: 'debuff', effect: '混乱 3 秒', cooldown: 8 },
      { name: '逼婚攻势', type: 'attack', effect: '持续压力伤害', cooldown: 10 },
    ],
    weaknessTemplate: '被拒绝话术反制',
    color: '#FF1744',
    shape: 'heart',
  },
  {
    keyword: '房贷',
    nameSuffix: '重担兽',
    avatar: '🏠',
    skillTemplates: [
      { name: '月供压力', type: 'debuff', effect: '持续掉金币', cooldown: 10 },
      { name: '利率上调', type: 'attack', effect: '增伤 20%', cooldown: 12 },
      { name: '三十年契约', type: 'debuff', effect: '束缚 2 秒', cooldown: 15 },
    ],
    weaknessTemplate: '被一次性付清技能解除',
    color: '#6A1B9A',
    shape: 'square',
  },
  {
    keyword: '考试',
    nameSuffix: '试卷兽',
    avatar: '📝',
    skillTemplates: [
      { name: '倒计时焦虑', type: 'debuff', effect: '减速 25%', cooldown: 8 },
      { name: '题海战术', type: 'attack', effect: '多段伤害', cooldown: 6 },
      { name: '临时抱佛脚', type: 'summon', effect: '召唤笔记小怪', cooldown: 12 },
    ],
    weaknessTemplate: '被满分答案一击必杀',
    color: '#2196F3',
    shape: 'triangle',
  },
  {
    keyword: '论文',
    nameSuffix: '文献兽',
    avatar: '📚',
    skillTemplates: [
      { name: '查重警报', type: 'debuff', effect: '标记目标', cooldown: 10 },
      { name: '导师催稿', type: 'attack', effect: '精神伤害', cooldown: 8 },
      { name: '引用混乱', type: 'debuff', effect: '混乱 2 秒', cooldown: 12 },
    ],
    weaknessTemplate: '被原创观点击溃',
    color: '#795548',
    shape: 'square',
  },
  {
    keyword: '应酬',
    nameSuffix: '酒局兽',
    avatar: '🍷',
    skillTemplates: [
      { name: '敬酒攻势', type: 'attack', effect: '多段伤害', cooldown: 5 },
      { name: '醉酒状态', type: 'debuff', effect: '眩晕 2 秒', cooldown: 10 },
      { name: '客户来电', type: 'summon', effect: '召唤客户小怪', cooldown: 12 },
    ],
    weaknessTemplate: '被茶水替换解酒',
    color: '#FF9800',
    shape: 'circle',
  },
  {
    keyword: '攀比',
    nameSuffix: '虚荣兽',
    avatar: '💎',
    skillTemplates: [
      { name: '炫耀攻势', type: 'attack', effect: '精神伤害', cooldown: 8 },
      { name: '同辈压力', type: 'debuff', effect: '降低全属性 15%', cooldown: 10 },
      { name: '物质诱惑', type: 'debuff', effect: '混乱 3 秒', cooldown: 12 },
    ],
    weaknessTemplate: '被知足常乐光环净化',
    color: '#E91E63',
    shape: 'triangle',
  },
  {
    keyword: '迷茫',
    nameSuffix: '迷雾兽',
    avatar: '🌫️',
    skillTemplates: [
      { name: '方向迷失', type: 'debuff', effect: '混乱 4 秒', cooldown: 10 },
      { name: '未来焦虑', type: 'attack', effect: '持续伤害', cooldown: 8 },
      { name: '选择困难', type: 'debuff', effect: '减速 40%', cooldown: 12 },
    ],
    weaknessTemplate: '被目标明确之光驱散',
    color: '#607D8B',
    shape: 'circle',
  },
];

// 通用兜底模板：未知关键词使用
export const fallbackEntry: StressKeywordEntry = {
  keyword: '',
  nameSuffix: '怪兽',
  avatar: '👾',
  skillTemplates: [
    { name: '压力冲击', type: 'attack', effect: '普通伤害', cooldown: 8 },
    { name: '焦虑光环', type: 'debuff', effect: '减速 20%', cooldown: 10 },
    { name: '阴影召唤', type: 'summon', effect: '召唤暗影小怪', cooldown: 12 },
  ],
  weaknessTemplate: '被情绪释放技能击破',
  color: '#888888',
  shape: 'circle',
};
