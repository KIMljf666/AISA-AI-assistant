# VTuber 角色形象制作策略文档

**创建日期**: 2026-03-08  
**适用范围**: Project AIRI VTuber 角色形象定制  
**角色对象**: 赛希斯（Saihisis / CSIS）

---

## 一、项目背景

AIRI 是一个开源 AI VTuber 单体仓库项目，同时支持两种角色模型格式：
- **Live2D**：2D 动态角色（packages/stage-ui-live2d）
- **VRM**：3D 角色模型（packages/stage-ui-three）— **推荐方案**

目标：为赛希斯创建一个可用于 VTuber 直播/展示的角色模型。

---

## 二、角色设计参考

### 核心视觉元素（源自 Q 版贴纸包）

| 元素     | 设计标准                  | 参考文件                                              |
| -------- | ------------------------- | ----------------------------------------------------- |
| **发色** | 银白色长发，及腰          | `discord_bot/stickers/wechat_pack/cover_240x240.png`  |
| **发饰** | 紫色四角星发夹（右侧）    | 所有 meme 图中一致                                    |
| **瞳色** | 紫色发光，星星高光        | `discord_bot/memes/love.png`                          |
| **服装** | 紫色星座纹连衣裙          | `discord_bot/stickers/wechat_pack/banner_750x400.png` |
| **纹样** | 星座连线 + 星星，金色镶边 | 所有 meme/sticker 一致                                |
| **配饰** | 紫色蝴蝶结（领口）        | Q版封面                                               |
| **色调** | 紫色系主调 (#6C3483)      | 整体风格                                              |

### 已生成的成熟版立绘

路径：`~/.gemini/antigravity/brain/2b0988cb-.../saihisis_live2d_front_*.png`

---

## 三、方案对比与选择

### 方案 A：Live2D（已评估，暂不采用）

| 项目     | 详情                                                    |
| -------- | ------------------------------------------------------- |
| 工具     | Live2D Cubism Editor (PRO $40/月)                       |
| 耗时     | 4-7 小时                                                |
| 步骤     | PSD 分层 → 导入 Cubism → 一键模板 → 微调 → 导出 .moc3   |
| AI 辅助  | KomikoAI（IP 被封）/ LlamaGen / 本地 anime-segmentation |
| 放弃原因 | AIRI 对 VRM 支持更完整，Live2D 工具链门槛较高           |

### 方案 B：VRM 3D 模型 ✅ 推荐

| 项目      | 详情                                                        |
| --------- | ----------------------------------------------------------- |
| 工具      | VRoid Studio（完全免费）                                    |
| 耗时      | 1-2 小时                                                    |
| 步骤      | VRoid Studio 创建 → 导出 .vrm → 拖入 AIRI                   |
| AIRI 支持 | 完整：Three.js NPR 渲染 + 眨眼 + 视线追踪 + 口型同步 + 表情 |
| 集成方式  | 运行时拖拽 或 注册为内置预设                                |

---

## 四、VRM 方案操作步骤

### 4.1 VRoid Studio 设置

1. 下载：https://vroid.com/studio（免费，Win/Mac）
2. 新建女性角色
3. 配置参数：
   - 脸型：日系动漫风，偏圆润
   - 眼睛：大眼模板，瞳色紫色 (#9B59B6)
   - 头发：银白色 (#E0E0F0)，长发及腰，齐刘海  
   - 发饰：右侧紫色四角星（在纹理中手绘或后期 Blender 添加）
   - 服装：紫色连衣裙，导入星座纹理贴图
   - 领饰：紫色蝴蝶结

### 4.2 导出

- Export as VRM → Title: Saihisis → Export

### 4.3 集成到 AIRI

**快速方式**：运行 `pnpm dev` → 界面中拖入 .vrm 文件

**永久预设**：  
```
packages/stage-ui/src/assets/vrm/models/Saihisis/
├── Saihisis.vrm
└── preview.png
```

在 `packages/stage-ui/src/stores/display-models.ts` 中注册：
```typescript
const presetVrmSaihisisUrl = new URL('../assets/vrm/models/Saihisis/Saihisis.vrm', import.meta.url).href
const presetVrmSaihisisPreview = new URL('../assets/vrm/models/Saihisis/preview.png', import.meta.url).href

// 添加到 displayModelsPresets 数组
{ id: 'preset-vrm-saihisis', format: DisplayModelFormat.VRM, type: 'url', 
  url: presetVrmSaihisisUrl, name: 'Saihisis', 
  previewImage: presetVrmSaihisisPreview, importedAt: Date.now() }
```

---

## 五、已搭建的本地工具

### AI 角色分层工具（供将来使用）

路径：`Vtuber/segment_character.py`

```bash
# 激活环境
source Vtuber/.venv/bin/activate

# 对任意角色立绘进行 AI 分层
python segment_character.py 角色图片.png [输出目录]
```

依赖：onnxruntime + pillow + opencv（已安装在 .venv 中）  
模型：`Vtuber/isnetis.onnx`（167MB，SkyTNT/anime-segmentation ISNet）

输出：去背景全身图 + 头发/面部/上身/下身分区图 + 分区参考图

---

## 六、相关文档索引

| 文档              | 位置                                             |
| ----------------- | ------------------------------------------------ |
| AIRI 项目分析     | `~/.gemini/.../project_analysis.md`              |
| Live2D 可行性分析 | `~/.gemini/.../live2d_creation_analysis.md`      |
| Live2D 制作教程   | `~/.gemini/.../saihisis_live2d_guide.md`         |
| VRM 制作教程      | `~/.gemini/.../saihisis_vrm_guide.md`            |
| 贴纸包规范        | KI: saihisis_sticker_pack_design_and_integration |
