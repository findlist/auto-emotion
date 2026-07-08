# 设计系统规范

## 1. 设计原则

本项目采用 **Neo-brutalism** 风格，结合解压游戏主题：

- **硬阴影、粗边框、高对比度** - 所有交互元素使用 `shadow-*` 和 `border-*` token
- **明快色彩、圆润造型** - 使用 `color-*` 和 `radius-*` token
- **趣味动效** - 使用 `duration-*` token 控制动画节奏
- **移动优先** - 响应式布局、触摸友好的尺寸（最小 44px 触摸区域）

## 2. 颜色系统

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-pink` | `#ff3d7f` | 主色、强调、错误状态 |
| `--color-yellow` | `#ffd93d` | 警告、金币、经验值 |
| `--color-orange` | `#ff6b35` | 次要强调、链接、CTA |
| `--color-ink` | `#1a1a1a` | 文字、边框、阴影 |
| `--color-cream` | `#fff8e7` | 背景、卡片、浅色表面 |
| `--color-mint` | `#3dd9b5` | 成功、健康、生命值 |

### 使用建议

- 主要操作按钮使用 `bg-pink text-cream`
- 次要操作使用 `bg-orange text-cream`
- 信息卡片使用 `bg-cream border-ink`
- 成功提示使用 `text-mint`

## 3. 间距系统

基于 **4px 网格**，使用 `--space-*` token：

| Token | 值 | 像素 | 用途 |
|-------|-----|------|------|
| `--space-1` | `0.25rem` | 4px | 微间距、图标与文字间距 |
| `--space-2` | `0.5rem` | 8px | 紧凑间距、标签内边距 |
| `--space-3` | `0.75rem` | 12px | 小组件内边距 |
| `--space-4` | `1rem` | 16px | 标准内边距、元素间距 |
| `--space-5` | `1.25rem` | 20px | 中等间距 |
| `--space-6` | `1.5rem` | 24px | 卡片内边距 |
| `--space-8` | `2rem` | 32px | 区块间距 |
| `--space-10` | `2.5rem` | 40px | 大区块间距 |
| `--space-12` | `3rem` | 48px | 页面级间距 |
| `--space-16` | `4rem` | 64px | 最大间距 |

### 使用示例

```html
<!-- 按钮内边距 -->
<button class="p-4">按钮</button>

<!-- 卡片内边距 -->
<div class="p-6">卡片内容</div>

<!-- 元素间距 -->
<div class="flex gap-4">...</div>
```

## 4. 圆角系统

| Token | 值 | 适用场景 |
|-------|-----|---------|
| `--radius-sm` | `0.25rem` (4px) | 小组件：标签、徽章 |
| `--radius-md` | `0.5rem` (8px) | 按钮、输入框 |
| `--radius-lg` | `0.75rem` (12px) | 卡片、面板 |
| `--radius-xl` | `1rem` (16px) | 较大容器 |
| `--radius-2xl` | `1.5rem` (24px) | 弹窗、模态框 |
| `--radius-full` | `9999px` | 圆形：头像、图标按钮 |

### 使用示例

```html
<!-- 按钮 -->
<button class="rounded-md">按钮</button>

<!-- 卡片 -->
<div class="rounded-lg">卡片内容</div>

<!-- 圆形头像 -->
<img class="rounded-full w-12 h-12" />
```

## 5. 阴影系统

Neo-brutalism 风格硬阴影，使用 `--shadow-*` token：

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-sm` | `2px 2px 0 0 #1a1a1a` | Hover 状态、小元素 |
| `--shadow-md` | `4px 4px 0 0 #1a1a1a` | 默认阴影、按钮、卡片 |
| `--shadow-lg` | `6px 6px 0 0 #1a1a1a` | 悬浮元素、下拉菜单 |
| `--shadow-xl` | `8px 8px 0 0 #1a1a1a` | 模态框、重要提示 |

### 交互模式

```html
<!-- 按钮交互示例 -->
<button class="
  shadow-md
  hover:shadow-sm hover:translate-x-[2px] hover:translate-y-[2px]
  active:shadow-none active:translate-x-[4px] active:translate-y-[4px]
  transition-all
">
  按钮
</button>
```

**交互状态说明：**
- **默认状态**：`shadow-md` (4px 偏移)
- **Hover 状态**：`shadow-sm` (2px 偏移) + `translate` - 按钮"下沉"效果
- **Active 状态**：`shadow-none` + `translate` - 按钮"按下"效果

## 6. 边框宽度

| Token | 值 | 用途 |
|-------|-----|------|
| `--border-thin` | `2px` | 分隔线、细边框 |
| `--border-normal` | `3px` | 标准边框、卡片 |
| `--border-thick` | `4px` | 强调边框、重要元素 |

### 使用示例

```html
<!-- 标准卡片边框 -->
<div class="border-[--border-normal] border-ink">...</div>

<!-- 强调按钮 -->
<button class="border-[--border-thick] border-ink">...</button>
```

## 7. 动画系统

使用 `--duration-*` token 控制动画时长：

| Token | 值 | 适用场景 |
|-------|-----|---------|
| `--duration-fast` | `150ms` | Hover、Focus 等快速交互 |
| `--duration-normal` | `250ms` | 状态切换、展开/折叠 |
| `--duration-slow` | `400ms` | 页面过渡、进入/退出动画 |
| `--duration-slower` | `600ms` | 复杂动画、加载特效 |

### 使用示例

```css
/* 快速交互 */
button {
  transition: all var(--duration-fast) ease;
}

/* 页面过渡 */
.page-enter {
  animation: fadeIn var(--duration-slow) ease-out;
}
```

## 8. 字体系统

### 字体族

| Token | 字体 | 用途 |
|-------|------|------|
| `--font-display` | Bungee, ZCOOL KuaiLe | 英文标题、Logo |
| `--font-cn` | ZCOOL KuaiLe, Bungee | 中文标题 |
| `--font-mono` | DM Mono, ui-monospace | 数据、代码、标签 |

### 字体大小

| Token | 值 | 像素 | 用途 |
|-------|-----|------|------|
| `--text-xs` | `0.75rem` | 12px | 辅助文字、标签 |
| `--text-sm` | `0.875rem` | 14px | 小标题、说明 |
| `--text-base` | `1rem` | 16px | 正文 |
| `--text-lg` | `1.125rem` | 18px | 小标题 |
| `--text-xl` | `1.25rem` | 20px | 标题 |
| `--text-2xl` | `1.5rem` | 24px | 大标题 |
| `--text-3xl` | `1.875rem` | 30px | 页面标题 |
| `--text-4xl` | `2.25rem` | 36px | Hero 标题 |

### 使用示例

```html
<!-- 中文标题 -->
<h1 class="font-cn text-2xl">游戏标题</h1>

<!-- 数据展示 -->
<span class="font-mono text-sm">Lv.10 · 1000 EXP</span>

<!-- 正文 -->
<p class="text-base">正文内容</p>
```

## 9. 组件规范

### 按钮

```html
<!-- 主要按钮 -->
<button class="bg-pink text-cream px-6 py-3 rounded-md font-cn text-lg
  shadow-md hover:shadow-sm hover:translate-x-[2px] hover:translate-y-[2px]
  active:shadow-none active:translate-x-[4px] active:translate-y-[4px]
  transition-all">
  开始游戏
</button>

<!-- 次要按钮 -->
<button class="bg-orange text-cream px-4 py-2 rounded-md font-mono text-sm
  shadow-md hover:shadow-sm hover:translate-x-[2px] hover:translate-y-[2px]
  transition-all">
  查看详情
</button>

<!-- 幽灵按钮 -->
<button class="bg-cream text-ink px-4 py-2 rounded-md border-[--border-normal] border-ink
  shadow-md hover:shadow-sm hover:translate-x-[2px] hover:translate-y-[2px]
  transition-all">
  取消
</button>
```

### 卡片

```html
<!-- 标准卡片 -->
<div class="bg-cream rounded-lg p-6 border-[--border-normal] border-ink shadow-md">
  <h3 class="font-cn text-lg mb-2">卡片标题</h3>
  <p class="font-mono text-sm text-ink/70">卡片内容</p>
</div>

<!-- 强调卡片 -->
<div class="bg-pink text-cream rounded-lg p-4 shadow-lg">
  <p class="font-cn text-xl">重要提示</p>
</div>
```

### 输入框

```html
<input class="w-full px-4 py-3 rounded-md border-[--border-normal] border-ink
  font-mono text-base bg-cream
  focus:outline-none focus:ring-2 focus:ring-pink
  transition-all" />
```

### 头像

```html
<!-- 圆形头像 -->
<div class="w-12 h-12 rounded-full bg-pink flex items-center justify-center
  font-bold text-lg text-cream">
  A
</div>
```

### 标签

```html
<span class="inline-block px-2 py-1 rounded-sm bg-yellow text-ink font-mono text-xs">
  NEW
</span>
```

## 10. 响应式断点

使用 Tailwind CSS 默认断点：

| 断点 | 最小宽度 | 设备 |
|------|---------|------|
| `sm` | 640px | 手机横屏 |
| `md` | 768px | 平板 |
| `lg` | 1024px | 桌面 |
| `xl` | 1280px | 大桌面 |

### 移动优先示例

```html
<!-- 移动端单列，桌面端双列 -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  ...
</div>
```

## 11. 最佳实践

1. **始终使用 token** - 避免硬编码颜色、间距、圆角等值
2. **保持一致性** - 同类组件使用相同的 token
3. **语义化命名** - 使用 Tailwind 的语义化类名而非直接引用 CSS 变量
4. **动画性能** - 优先使用 `transform` 和 `opacity` 进行动画
5. **触摸友好** - 移动端按钮最小尺寸 44px × 44px
