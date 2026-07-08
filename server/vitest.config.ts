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
      // 排除测试文件本身、类型声明、入口文件
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/app.ts'],
      // 覆盖率阈值（生产就绪阶段目标 70%）
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    // 环境：后端纯 Node 环境
    environment: 'node',
  },
});
