// server/src/routes/__helpers__/test-server.ts
// 路由测试共享 helper：抽取 controllableAuth、getServerPort、mockIdempotencyConflict
// 设计原因：
// - 11 个 routes 测试文件逐字复制 controllableAuth 函数（含 11 处 as unknown as 类型断言），
//   17 个 routes 测试文件重复两行 server.address() as { port: number } 模板（含 17 处类型断言），
//   统一抽取消除 28 处类型断言残留，并避免后续维护时多处修改的同步成本。
// - 6 个 routes 测试文件共 7 处重复 withIdempotency mockImplementationOnce 4 行模板，抽取后保证
//   fail 调用顺序与固定文案「请求已存在，请稍后重试」一致。
// 边界：仅测试代码使用，不影响运行时行为；helper 文件命名非 .test.ts 后缀，不会被 vitest 当作测试文件执行。

import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import { ErrorCode } from '../../utils/error.js';
import { fail } from '../../utils/response.js';

/**
 * 可控鉴权中间件：通过请求头 x-test-no-auth 模拟未授权场景，
 * 默认注入 req.user 模拟已登录用户，避免每个用例重复构造。
 * 设计原因：handler 内部检查 req.user 的路由测试需可控注入用户身份，
 * 未授权场景由路由 handler 自行 fail(res, 401) 兜底，与中间件逻辑解耦。
 */
export function controllableAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.headers['x-test-no-auth'] === '1') {
    next();
    return;
  }
  (req as unknown as { user: { userId: string } }).user = { userId: 'u1' };
  next();
}

/**
 * 等待 Express server 端口绑定完成并返回端口号。
 * 设计原因：app.listen(0) 后端口绑定是异步过程，立即读 address() 可能返回 null，
 * 统一封装「等待 listening 事件 + 读取 port」两步模板，消除 17 处重复代码与类型断言。
 */
export async function getServerPort(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.once('listening', resolve));
  return (server.address() as { port: number }).port;
}

/**
 * 模拟 withIdempotency 命中幂等拦截：调用 fail 返回 409 + 固定文案。
 * 设计原因：6 个 routes 测试文件共 7 处重复以下 4 行模板：
 *   (withIdempotency as ReturnType<typeof vi.fn>).mockImplementationOnce(async res => {
 *     fail(res, ErrorCode.CONFLICT, '请求已存在，请稍后重试');
 *     return false;
 *   });
 * 抽取后消除重复，并保证 fail 调用顺序与固定文案一致。
 * 参数类型为 unknown：测试文件中 withIdempotency 经 vi.mock 替换后类型签名仍是真实函数，
 * 调用方直接传入即可，由 helper 内部统一 as 断言为 mock 函数。
 */
export function mockIdempotencyConflict(withIdempotencyMock: unknown): void {
  (withIdempotencyMock as ReturnType<typeof vi.fn>).mockImplementationOnce(async (res: Response) => {
    fail(res, ErrorCode.CONFLICT, '请求已存在，请稍后重试');
    return false;
  });
}
