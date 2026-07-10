# HALOVIA 制谱器 — Chart Editor

基于 Web 的 HALOVIA 谱面编辑器，纯前端零依赖，支持 `file://` 本地直接打开。

## 快速开始

```
制谱器/v4R/index.html
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
v4R/
├── index.html        # 页面入口
├── style.css         # 深色主题样式
├── state.js          # 全局状态 + 表达式系统
├── presets.js        # 运动预设 + 轨道求值
├── tracks.js         # 轨道面板 UI
├── timeline.js       # 时间轴 Canvas
├── preview.js        # 3D 预览渲染
├── notes.js          # 音符管理
├── audio.js          # 音频 + 能量分析
├── io.js             # 导入/导出
├── ui.js             # UI 工具
├── gameplay.js       # 试玩模式
├── undo.js           # 撤销/重做
├── init.js           # 初始化
├── validation.js     # 校验
├── sfx.js            # 音效
└── sound/            # 音效文件
```

## 开发

所有文件均为纯 JavaScript，不依赖任何框架或构建工具。

- 修改后刷新浏览器即可生效
- `.hvf` 版本号为 `2.0`，旧版 `.hvf` 无法直接导入
