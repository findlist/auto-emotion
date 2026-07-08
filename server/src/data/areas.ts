/**
 * 情绪区域配置数据
 * 5个挂机区域的属性配置
 */

export interface AreaConfig {
  id: number;
  name: string;
  description: string;
  required_level: number;
  exp_rate: number;
  gold_rate: number;
  bg_color: string;
}

export const AREAS: AreaConfig[] = [
  {
    id: 1,
    name: '加班解压室',
    description: '键盘敲击声陪伴',
    required_level: 1,
    exp_rate: 1.0,
    gold_rate: 1.0,
    bg_color: '#FF6B9D',
  },
  {
    id: 2,
    name: 'KPI 击破场',
    description: '数字粉碎',
    required_level: 5,
    exp_rate: 1.5,
    gold_rate: 1.2,
    bg_color: '#C44EFF',
  },
  {
    id: 3,
    name: '堵车释放区',
    description: '喇叭与刹车',
    required_level: 10,
    exp_rate: 2.0,
    gold_rate: 1.5,
    bg_color: '#FFB347',
  },
  {
    id: 4,
    name: '催婚突围战',
    description: '弹珠大战',
    required_level: 15,
    exp_rate: 2.5,
    gold_rate: 2.0,
    bg_color: '#FF6961',
  },
  {
    id: 5,
    name: '房贷解压山',
    description: '登顶望远',
    required_level: 20,
    exp_rate: 3.0,
    gold_rate: 2.5,
    bg_color: '#77DD77',
  },
];
