import http from './http';
import { unwrap } from './unwrap';

export interface PressureData {
  work: number;
  life: number;
  social: number;
  finance: number;
  health: number;
  hasData: boolean;
}

// unwrap 直接返回 PressureData：响应拦截器已将 ApiResponse.data 挂到 response.data，
// 改写后消除原 `as PressureData` 类型断言，由 unwrap<T> 自动推导
export function getPressureStats(): Promise<PressureData> {
  return unwrap(http.get<PressureData>('/user/pressure-stats'));
}
