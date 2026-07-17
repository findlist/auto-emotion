import type { AxiosResponse } from 'axios';

/**
 * 解包 AxiosResponse 为业务数据
 * - 拦截器已将 ApiResponse.data 挂到 response.data 上，此处仅做类型层面的 unwrap
 * - 设计原因：14 处 API 调用重复 `.then((r) => r.data)` 链式样板，与 `const res = await ...; return res.data;` 等价，
 *   但更紧凑且避免临时变量 res；抽取后统一风格，消除样板，便于后续统一剩余 35 处 async/await 风格
 */
export function unwrap<T>(p: Promise<AxiosResponse<T>>): Promise<T> {
  return p.then((r) => r.data);
}
