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

/**
 * 解包 AxiosResponse 并提取指定字段：消除 9 处 api 模块重复的
 * `const data = await unwrap(http.get<{ xxx: Yyy[] }>(...)); return data.xxx;` 3 行样板。
 *
 * 设计原因：friends/achievements/pets/shop/skills/tasks/weapons 等 9 处 GET 列表接口
 * 后端统一返回 `{ [字段名]: T[] }` 包装结构，前端重复"unwrap + 取字段"模式。
 * 抽取后调用方一行表达意图，类型层面 K extends keyof T 保证字段名与返回类型联动。
 *
 * @param p Axios 响应 Promise（拦截器已解包 ApiResponse.data 到 response.data）
 * @param field 要提取的字段名（须为 T 的已知键）
 * @returns data[field] 字段值
 */
export async function unwrapField<T, K extends keyof T>(
  p: Promise<AxiosResponse<T>>,
  field: K
): Promise<T[K]> {
  const data = await unwrap(p);
  return data[field];
}
