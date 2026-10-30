# Full-Flow · 拆开一台火箭发动机

全流量分级燃烧发动机的交互式学习页原型（M1）。基于 Three.js + Vite + TypeScript，使用 FarsideLab 的 full-flow GLB 与零件清单。

设计文档见 [`设计稿.md`](./设计稿.md)。

## 运行

```bash
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/>。

生产构建：

```bash
npm run build
npm run preview
```

## 当前功能

- **拆解**：0–100% 滑块，按 manifest 的 `explode_offset` 逐零件分离，按 `explode_order` 错峰，带阻尼。
- **自动取景**：拆解时相机随零件边界拉远/回中，保证整台发动机留在画面内。
- **零件查看**：悬停高亮 + 名称浮标；点击聚焦并打开中文信息卡（作用、设计原因、观察提示、分离顺序）。
- **自转**：按 `spin.axis` 与 `rev_per_s` 驱动两个涡轮泵转子；拆解超过 40% 自动暂停。
- **剖切**：沿推力轴裁掉前半部分，`cut: false` 的零件不参与裁剪。
- **流动**：发动机变为半透明，显示燃料（橙）、氧化剂（蓝）和燃气（黄）流道。
- **移动端**：单列布局、底部信息抽屉、选中时自动隐藏首屏标题。
- **无障碍**：键盘可操作滑块/按钮；Tab 到隐藏的“选择零件”下拉框可按名称选零件；支持 `prefers-reduced-motion`。

## 项目结构

```
.
├── index.html                  # 页面骨架与 UI
├── src/
│   ├── main.ts                 # 场景、相机、交互、状态
│   ├── style.css               # 界面样式
│   ├── data/teaching.ts        # 34 个零件的中文教学文案
│   └── engine/
│       ├── types.ts            # manifest 类型
│       ├── loadEngine.ts       # GLB + manifest 加载、材质克隆、坐标转换
│       └── exploder.ts         # 爆炸进度、错峰、边界计算
├── public/assets/
│   ├── full-flow_d.glb         # 当前案例模型（3.6 MB）
│   └── full-flow.json          # 零件、爆炸、旋转、流道数据
├── assets/farsidelab-rocket-engines/  # 完整 13 台发动机资产快照
├── scripts/visual-check.mjs    # 无头 Chrome 截图与交互检查
└── 设计稿.md
```

## 截图检查

先启动 `npm run dev`，再运行：

```bash
npm run check:visual
```

脚本使用 macOS 上的 Chrome：

```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

输出位于 `/tmp/ff-*.png`。如果 Chrome 路径不同，修改 `scripts/visual-check.mjs` 里的 `CHROME`。

## 资产与许可

- 模型和清单来自 [FarsideLab 的火箭发动机目录](https://farsidelab.com/concept/rocket-engines/)，下载于 2026-10-30。
- 13 台发动机的完整快照、`catalog.json` 和许可说明见 [`assets/farsidelab-rocket-engines/README.md`](./assets/farsidelab-rocket-engines/README.md)。
- **模型本身没有标注开源许可。** 当前仅用于本地原型评估；公开发布前需要取得作者授权或替换为自制模型。`catalog.json` 里的 CC0 / Public Domain 只针对实拍照片。

## 已知限制 / 下一步

- 流动模式目前是静态流线 + 呼吸发光，还没有按流向移动的条纹 shader。
- 剖切是简单裁剪，没有实心截面或遮挡件 ghost 副本。
- 信息卡文案是 M1 教学稿，正式上线前需要领域审校。
- 目前只接入 full-flow 一台；扩展 13 台时需要补目录页、按需加载和机型切换。
- 构建产物约 669 KB（gzip 170 KB），主要来自 three.js；后续可按需拆包。
