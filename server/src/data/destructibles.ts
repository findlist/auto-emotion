/**
 * 可破坏物品配置数据
 * 20+ 可破坏物品的类型、HP 和奖励
 */

export interface DestructibleConfig {
  id: number;
  type: string;
  name: string;
  hp: number;
  reward: number;
  color: string;
}

export const DESTRUCTIBLES: DestructibleConfig[] = [
  { id: 1, type: 'box', name: '纸箱', hp: 10, reward: 5, color: '#DEB887' },
  { id: 2, type: 'bottle', name: '塑料瓶', hp: 5, reward: 3, color: '#87CEEB' },
  { id: 3, type: 'glass', name: '玻璃杯', hp: 8, reward: 4, color: '#E0FFFF' },
  { id: 4, type: 'balloon', name: '气球', hp: 3, reward: 2, color: '#FF69B4' },
  { id: 5, type: 'bubble_wrap', name: '泡泡纸', hp: 15, reward: 8, color: '#98FB98' },
  { id: 6, type: 'watermelon', name: '西瓜', hp: 30, reward: 15, color: '#FF6347' },
  { id: 7, type: 'keyboard', name: '键盘', hp: 25, reward: 12, color: '#696969' },
  { id: 8, type: 'monitor', name: '显示器', hp: 40, reward: 20, color: '#4682B4' },
  { id: 9, type: 'stack_papers', name: '一叠文件', hp: 12, reward: 6, color: '#FFFACD' },
  { id: 10, type: 'coffee_cup', name: '咖啡杯', hp: 6, reward: 4, color: '#8B4513' },
  { id: 11, type: 'stapler', name: '订书机', hp: 18, reward: 9, color: '#C0C0C0' },
  { id: 12, type: 'pencil', name: '铅笔', hp: 4, reward: 2, color: '#FFD700' },
  { id: 13, type: 'eraser', name: '橡皮擦', hp: 3, reward: 2, color: '#FF69B4' },
  { id: 14, type: 'notebook', name: '笔记本', hp: 20, reward: 10, color: '#F5F5DC' },
  { id: 15, type: 'phone', name: '手机', hp: 35, reward: 18, color: '#1a1a1a' },
  { id: 16, type: 'tablet', name: '平板电脑', hp: 45, reward: 22, color: '#708090' },
  { id: 17, type: 'mouse', name: '鼠标', hp: 15, reward: 8, color: '#2F4F4F' },
  { id: 18, type: 'headphones', name: '耳机', hp: 22, reward: 11, color: '#4B0082' },
  { id: 19, type: 'usb_drive', name: 'U盘', hp: 8, reward: 5, color: '#006400' },
  { id: 20, type: 'laptop', name: '笔记本电脑', hp: 50, reward: 25, color: '#4682B4' },
  { id: 21, type: '茶杯', name: '马克杯', hp: 10, reward: 5, color: '#FF6347' },
  { id: 22, type: '计算器', name: '计算器', hp: 14, reward: 7, color: '#C0C0C0' },
];
