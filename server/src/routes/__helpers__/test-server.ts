// server/src/routes/__helpers__/test-server.ts
// 路由测试共享 helper：抽取 controllableAuth 与 getServerPort
// 设计原因：11 个 routes 测试文件逐字复制 controllableAuth 函数（含 11 处 as unknown as 类型断言），
// 17 个 routes 测试文件重复两行 server.address() as { port: number } 模板（含 17 处类型断言），
// 统一抽取消除 28 处类型断言残留，并避免后续维护时多处修改的同步成本。
// 边界：仅测试代码使用，不影响运行时行为；helper 文件命名非 .test.ts 后缀，不会被 vitest 当作测试文件执行。

import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

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
