# HALOVIA 制谱器 — Chart Editor

> **🚀 当前开发分支**
> 此分支（`Dev`）为永久开发分支，所有版本通过 tag 标记。
>
> 历史存档：[`v4R`](https://github.com/halovia-game/chart-editor/tree/v4R) · [`v5OC`](https://github.com/halovia-game/chart-editor/tree/v5OC) · [`v5R`](https://github.com/halovia-game/chart-editor/tree/v5R)

基于 Web 的 HALOVIA 谱面编辑器，纯前端零依赖，支持 `file://` 本地直接打开。

## 快速开始

```
index.html
```

用浏览器直接打开即可使用。无需安装、无需服务器。

## 功能特性

### 关键帧编辑

基于**关键帧 + 段间预设**的路径编辑模型：

1. 在时间轴上用 `Ctrl+左键` 拖拽关键帧菱形改变时间
2. 在预览区拖拽判定环创建/修改关键帧位置
3. 相邻关键帧之间可选择运动预设

### 10 种运动预设

| 预设 | 说明 | 参数来源 |
|------|------|---------|
| 不显示 | 隐藏段 | — |
| 静止 | 保持关键帧位置 | 两端关键帧 |
| 直线 | 匀速直线运动 | 两端关键帧 |
| 直线-缓入 | 慢→快 (`pⁿ`) | 两端关键帧 + 强度 k |
| 直线-缓出 | 快→慢 | 两端关键帧 + 强度 k |
| 直线-缓入出 | 两头慢中间快 | 两端关键帧 + 强度 k |
| 贝塞尔曲线 | 三阶贝塞尔缓动 | 两端关键帧 + 4 控制点 |
| 椭圆/圆 | 三角函数轨迹 | 手动参数 |
| Lissajous | 李萨如曲线 | 手动参数，含 8 字预设 |
| 自定义 | JavaScript 表达式 | 手动输入 |

### 时间轴

- 刻度尺 + 节拍线 + 吸附采样周期
- 全频/低频/高频能量波形背景
- A/B 循环标记
- 红色游标可拖动跳转

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` / `Ctrl+Y` | 重做 |
| `Ctrl+S` | 导出 .hvf |
| `Ctrl+O` | 导入谱面 |
| `Ctrl+Shift+A` | 设置循环起点 |
| `Ctrl+Shift+B` | 设置循环终点 |
| `?` | 打开帮助面板 |

## 文件格式

### .hvf (HALOVIA Format — 编辑格式)

```json
{
  "version": "2.0",
  "meta": {
    "bpm": 120,
    "sampleRateReal": 10.0,
    "offsetSec": 0,
    "duration": 30,
    "fov": 55,
    "audioPath": "song.mp3"
  },
  "tracks": [{
    "id": 0,
    "keyframes": [
      { "time": 0, "x": 0, "y": 0, "hidden": false },
      { "time": 15, "x": 0.5, "y": -0.3, "hidden": false }
    ],
    "segmentPresets": [
      { "preset": "line", "params": {} }
    ]
  }],
  "notes": [
    { "track": 0, "type": 1, "time": 5.0 }
  ]
}
```

### .hvp (HALOVIA Play Code — 运行时格式)

紧凑十进制编码，适合游戏引擎直接解析。

## 项目结构

```
├── index.html        # 页面入口
├── css/
│   ├── core.css      # 核心: 变量、表单、按钮、滚动条、Toast
│   ├── layout.css    # 布局: 顶栏、面板骨架、全局参数
│   ├── tracks.css    # 轨道: 目录、面板、分段卡片
│   ├── preview.css   # 预览: 3D 场景、全屏、控件
│   ├── timeline.css  # 时间轴: 画布、工具栏
│   └── modals.css    # 弹窗: 所有弹出层
├── js/state.js       # 全局状态 + 表达式系统
├── js/presets.js     # 运动预设 + 轨道求值
├── js/tracks.js      # 轨道面板 UI
├── js/timeline.js    # 时间轴 Canvas
├── js/preview.js     # 3D 预览渲染
├── js/notes.js       # 音符管理
├── js/audio.js       # 音频 + 能量分析
├── js/io.js          # 导入/导出
├── js/ui.js          # UI 工具
├── js/gameplay.js    # 试玩模式
├── js/undo.js        # 撤销/重做
├── js/init.js        # 初始化
├── js/validation.js  # 校验
├── js/sfx.js         # 音效
├── sound/            # 音效文件（Tap.mp3, Keep.mp3, Hold.mp3）
├── HALOVIA.md        # 游戏介绍
├── HALOVIA_制谱器_v2_架构说明.md  # v2 架构分析
└── 检查清单.md        # 开发自查清单
```

## 分支规划

| 分支 | 用途 | 维护策略 |
|------|------|---------|
| 分支 | 用途 | 维护策略 |
|------|------|---------|
| `Dev` | **永久开发分支** | 所有开发在此进行，版本发布时打 tag |
| `main` | 稳定主线 | 仅通过 `Dev` merge 进入，**禁止直接提交** |
| `v5R` | 已归档存档（Reasonix） | 不再维护，保留历史 |
| `v5OC` | 已冻结存档（OpenCode） | 不再维护，保留历史 |
| `v4R` | 旧版存档 | 不再维护，保留历史 |

工作流：`Dev` 开发 → `git merge Dev` 到 `main`（仅 merge，不 rebase）；版本更新时在 `Dev` 上打 tag（如 `v6.0`、`v7.0`），不再新开分支。

## 开发

所有文件均为纯 JavaScript，不依赖任何框架或构建工具。

- 修改后刷新浏览器即可生效
- `.hvf` 版本号为 `2.0`，旧版 `.hvf` 无法直接导入
