// server/vitest.config.ts
// Vitest 单元测试配置：与 tsconfig NodeNext 模块解析对齐

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试文件匹配规则：src 下所有 .test.ts 文件
    include: ['src/**/*.test.ts'],
    // 排除构建产物与依赖
    exclude: ['node_modules', 'dist'],
    // 启用全局 API（describe/it/expect 无需显式导入）
    globals: true,
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      // 纳入覆盖率统计的源码范围
      include: ['src/**/*.ts'],
      // 排除项说明（设计原因：仅统计可测试的业务逻辑，避免基础设施/静态数据/类型文件拖累指标）：
      // - *.test.ts：测试文件本身
      // - *.d.ts：类型声明文件（无运行时逻辑）
      // - app.ts / websocket/index.ts：HTTP 与 WebSocket 服务启动引导，副作用驱动，同属入口文件不可单测
      // - config/**：环境变量耦合的基础设施，import 时即触发 process.exit 校验，单测成本高、价值低
      // - data/**：纯静态数据表（武器/区域/Boss/可破坏物配置），无业务逻辑
      // - types/**：纯类型契约文件（无运行时代码，v8 会误报 0%）
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/app.ts',
        'src/websocket/index.ts',
        'src/config/**',
        'src/data/**',
        'src/types/**',
      ],
      // 覆盖率阈值：锁定生产就绪目标 70%，防止业务代码覆盖率回归
      // 当前实际覆盖率 ~93%，预留 23 个百分点的缓冲应对小幅波动
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
    // 环境：后端纯 Node 环境
    environment: 'node',
  },
});
