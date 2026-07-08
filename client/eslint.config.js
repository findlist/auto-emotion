import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // 允许以 _ 前缀标记的「有意未使用」参数与变量，对齐 TS 习惯用法（_delta / _nickname 等）
      // 设计原因：游戏类与适配器签名常保留接口约定的参数但当前实现未消费，删除会破坏接口契约
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // set-state-in-effect 降级为 warn：React 19 严格模式新规则对「页面挂载时加载数据」过于激进
      // 设计原因：项目当前架构是 useEffect 内调用 loadXxx 加载初始数据（achievements/friends/
      // leaderboard/records/season-pass/shop/tasks/battle 共 8 处），loadXxx 内同步 setLoading(true)
      // 触发该规则。官方推荐迁移到 useEffectEvent（实验性）或数据获取库（React Query/SWR），
      // 但项目当前不引入这些依赖。降级为 warn 保留提醒，未来引入数据获取库后可恢复为 error
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
