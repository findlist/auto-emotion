# 情绪爆破局 - 客户端

一款「放置挂机养成 + 鼠标点击式多人乱斗」的轻量级解压网游。

## 技术栈

- React 18 + TypeScript
- TailwindCSS 4
- PixiJS（游戏引擎）
- Zustand（状态管理）

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 目录结构

```
src/
├── api/          # API 接口
├── components/   # 通用组件
├── game/         # 游戏引擎
├── pages/        # 页面组件
├── stores/       # 状态管理
├── types/        # 类型定义
├── utils/        # 工具函数
└── websocket/    # WebSocket
```

## 环境变量

- VITE_API_URL: 后端 API 地址
- VITE_WS_URL: WebSocket 地址
