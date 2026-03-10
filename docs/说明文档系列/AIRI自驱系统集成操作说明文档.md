# AIRI × NarrativeEngine 自驱系统集成 — 操作说明文档

**版本** v2.0 · 2026-03-09 · 赛希斯 (Saihisis) ENTJ 人格体

---

## 一、系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                      AIRI VTuber 前端                            │
│  ┌──────────┐  ┌──────────────┐  ┌─────────┐  ┌─────────────┐  │
│  │ STT 语音 │→│ chat.ts      │→│ LLM     │→│ VTuber 渲染 │  │
│  │ 转录     │  │ performSend()│  │ Kimi k2.5│ │ VRM+TTS     │  │
│  └──────────┘  └──────┬───────┘  └────┬────┘  └─────────────┘  │
│                       │               │                          │
│           ┌───────────▼───────────────▼──────────┐              │
│           │   narrative-bridge.ts (Pinia Store)   │              │
│           │ fetchEnrichedPrompt / submitFeedback  │              │
│           └───────────┬───────────────┬──────────┘              │
│                       │ HTTP          │ WebSocket                │
│           ┌───────────▼───────────────▼──────────┐              │
│           │   CognitiveBubble.vue (可视化气泡)    │              │
│           │ Layer 0-9 实时流 / 角色状态 / 设置    │              │
│           └──────────────────────────────────────┘              │
└────────────────────────┬──────────────┬──────────────────────────┘
                         │ :5555        │ ws://:5555
┌────────────────────────▼──────────────▼──────────────────────────┐
│                  NarrativeEngine 后端 (port 5555)                 │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  airi_bridge.py (桥接 API + 意识流闭环)                      │ │
│  │  ├ GET  /api/airi/character-state/{id}                      │ │
│  │  ├ GET  /api/airi/character-state/{id}/system-prompt        │ │
│  │  ├ POST /api/airi/dialogue-feedback                         │ │
│  │  ├ WS   /api/airi/ws/cognitive-stream                       │ │
│  │  ├ POST /api/airi/consciousness/start|stop                  │ │
│  │  └ GET  /api/airi/health                                    │ │
│  └─────────────┬───────────────────────────────────────────────┘ │
│                │ _get_provider()                                  │
│  ┌─────────────▼───────────────────────────────────────────────┐ │
│  │  api/cpi/ — 认知供应商接口 (Cognitive Provider Interface)    │ │
│  │  ├ interface.py       → ICognitiveProvider ABC (12 方法)     │ │
│  │  ├ narrative_engine.py → NE 实现 (singleton + fallback)     │ │
│  │  ├ mock_provider.py   → 测试/降级实现                        │ │
│  │  ├ real_world_perception.py → 真实世界感知管道               │ │
│  │  └ __init__.py        → 工厂 (自动检测 + 降级)              │ │
│  └─────────────┬───────────────────────────────────────────────┘ │
│                │ import core/                                     │
│  ┌─────┐ ┌────┴───┐ ┌──────┐ ┌───────┐ ┌──────────┐            │
│  │四层  │ │L1-L4   │ │RGES  │ │目标   │ │意识流     │            │
│  │心理  │ │记忆    │ │反思  │ │管理   │ │UCS 9层   │            │
│  └─────┘ └────────┘ └──────┘ └───────┘ └──────────┘            │
└───────────────────────────────────────────────────────────────────┘
```

---

## 二、快速启动

### 前置条件

| 依赖       | 版本        | 说明              |
| ---------- | ----------- | ----------------- |
| Node.js    | ≥ 18        | AIRI 前端         |
| pnpm       | ≥ 8         | AIRI 包管理       |
| conda base | Python 3.12 | NarrativeEngine   |
| FastAPI    | ≥ 0.68      | conda base 已安装 |
| uvicorn    | ≥ 0.15      | conda base 已安装 |

### 一键启动

```bash
# 终端 1: 启动后端 (NarrativeEngine on port 5555)
./scripts/start_backend.sh

# 终端 2: 启动前端 (AIRI VTuber)
./scripts/start_frontend.sh
```

脚本位于 `NPC system 20250328/scripts/`，功能包括：
- **后端**: 自动使用 conda Python → 检查依赖 → 端口冲突处理 → 设置 API Key → 启动
- **前端**: 检查后端运行状态 → 检查 Node/pnpm → 首次自动 install → 启动 dev server

### 手动启动

```bash
# 后端
export MOONSHOT_API_KEY="sk-J5VBFyMk3gtNcQWSpWn0hgNWOwGqYQylVAKVX5WsC3XTUGQT"
cd narrative_engine
/Users/jifanliu/miniconda3/bin/python3 api/main.py

# 前端
cd Vtuber/airi
pnpm dev
```

验证后端: `curl http://localhost:5555/api/airi/health`

### LLM 配置

在 AIRI 界面中配置 LLM 提供商：
- **Provider**: OpenAI Compatible
- **Base URL**: `https://api.moonshot.cn/v1`
- **API Key**: `sk-J5VBFyMk3gtNcQWSpWn0hgNWOwGqYQylVAKVX5WsC3XTUGQT`
- **Model**: `kimi-k2.5-latest`

---

## 三、CPI 可插拔认知架构

### 设计理念

`airi_bridge.py` 不直接调用 `core/` 模块，而是通过 **CPI (Cognitive Provider Interface)** 间接访问。这实现了：
- **解耦**: 桥接层与核心零耦合，可独立开发测试
- **降级**: NarrativeEngine 不可用时自动切换到 MockProvider
- **可插拔**: 替换认知引擎只需新增一个 Provider 实现

### CPI 12 个能力

| 方法                        | 说明                            | Layer |
| --------------------------- | ------------------------------- | ----- |
| `get_character_config()`    | 角色配置                        | —     |
| `get_personality()`         | MBTI/Big Five/星座              | L1    |
| `get_psychological_state()` | 四层心理 + 需求 + 情绪          | L2-3  |
| `get_perception()`          | 🆕 真实世界感知 (时间/天气/新闻) | L0    |
| `get_consciousness()`       | 意识流片段                      | L7    |
| `get_active_goals()`        | 活跃目标                        | L5-6  |
| `recall_memories()`         | 🆕 关键词相关性记忆检索          | L3    |
| `store_memory()`            | 存储到指定记忆层                | L3    |
| `process_stimulus()`        | 🆕 UCS 4 阶段意识处理            | L0-8  |
| `submit_experience()`       | 🆕 对话反馈 + 关键信息提取 → L2  | L9    |
| `get_reflections()`         | RGES 反思洞察                   | L9    |
| `build_enriched_prompt()`   | 构造完整 system prompt          | All   |

---

## 四、真实世界感知管道

角色能感知真实世界，而非游戏世界：

| 感知维度 | 数据源                    | 示例输出                 | 缓存   |
| -------- | ------------------------- | ------------------------ | ------ |
| 🕐 时间   | `datetime.now()` 系统时间 | `3月9日 周一 下午`       | 无     |
| 📅 节假日 | 内置日历表                | `元旦` / `圣诞节`        | 无     |
| 🌤 天气   | wttr.in (curl)            | `Partly cloudy 13°C 35%` | 10 min |
| 📰 新闻   | BBC 中文 RSS (curl)       | 实时国际热点             | 1 h    |

**实现文件**: `api/cpi/real_world_perception.py`

---

## 五、意识流闭环 (Phase 4)

启动后，角色每 30 秒自主执行一轮认知循环：

```
consciousness_loop (每 30s)
│
├─ Step 1: 感知环境 → get_perception() → Layer 0 广播
├─ Step 2: 心理评估 → get_psychological_state()
├─ Step 3: 意识处理 → process_stimulus() → UCS 4 阶段
│   ├─ perception  → Layer 0 广播
│   ├─ processing  → Layer 2 广播
│   ├─ decision    → Layer 6 广播
│   └─ execution   → Layer 8 广播
├─ Step 4: 主动开口 → _estimate_importance() > 0.7
│   └─ 广播 proactive_dialogue 事件
├─ Step 5: 情绪追踪 → 跨周期对比 → emotion 变化广播
└─ Step 6: 需求广播 → 自然语言身体状态
```

启动/停止意识流:
```bash
curl -X POST http://localhost:5555/api/airi/consciousness/start
curl -X POST http://localhost:5555/api/airi/consciousness/stop
```

---

## 六、对话生命周期

```
1. 用户输入 → chat.ts:performSend()
2. 注入时间上下文
3. 🧠 GET /api/airi/character-state/{id}/system-prompt
   → CPI 聚合: 身份 + 心理 + 感知(真实世界) + 记忆 + 目标 + 意识流 + 反思 + 约束
   → 返回增强 prompt (约 500-1500 chars)
4. 增强 prompt → LLM 消息上下文
5. Kimi k2.5 流式生成
6. 回复完成后:
   a. POST /api/airi/dialogue-feedback
   b. 存储对话记忆 (L4)
   c. 🆕 提取关键信息 (姓名/偏好/事件) → L2 记忆升级
   d. 触发 RGES 经验反思
   e. 🆕 返回即时反思洞察
7. 所有认知事件 → WebSocket → CognitiveBubble 实时可视化
```

---

## 七、认知仿真气泡窗口

启动后，界面右下角出现 **🧠 认知仿真** 浮动气泡。

### 标签页

| 标签       | 功能                                    |
| ---------- | --------------------------------------- |
| 📡 实时流   | Layer 0-9 认知事件（颜色编码 + 时间戳） |
| 🪪 角色状态 | 人格、四层心理、目标进度                |
| ⚙️ 设置     | 桥接地址、角色 ID、连接控制             |

### Layer 颜色编码

| Layer | 名称            | 颜色      |
| ----- | --------------- | --------- |
| L0    | 感知层          | 🟣 indigo  |
| L2    | 认知处理        | 🟣 purple  |
| L3    | 记忆/情绪       | 🟣 fuchsia |
| L4    | 需求层          | 🩷 pink    |
| L6    | 决策层          | 🟠 orange  |
| L7    | 意识流/主动意识 | 🟡 yellow  |
| L8    | 执行层          | 🟢 green   |
| L9    | 反思层          | 🔵 cyan    |

---

## 八、赛希斯 (Saihisis) 角色配置

**配置文件**: `narrative_engine/data/characters/saihisis.json`

| 属性       | 值                                         |
| ---------- | ------------------------------------------ |
| MBTI       | ENTJ                                       |
| Big Five   | O:0.78 / C:0.85 / E:0.72 / A:0.45 / N:0.25 |
| 星座       | 水瓶座                                     |
| 核心价值观 | 追求知识与真理，守护数据世界的秩序         |
| 身份认同   | 星界守望者 — 连接星界与现实的桥梁          |
| 沟通风格   | 直接、高效、有逻辑                         |
| 决策风格   | 快速果断，直达核心                         |

---

## 九、文件清单

### 后端

| 文件                       | 位置               | 说明                             |
| -------------------------- | ------------------ | -------------------------------- |
| `airi_bridge.py`           | `api/`             | 桥接 API + Phase 4 意识流闭环    |
| `interface.py`             | `api/cpi/`         | ICognitiveProvider ABC (12 方法) |
| `narrative_engine.py`      | `api/cpi/`         | NE 实现 (488 行, 核心)           |
| `mock_provider.py`         | `api/cpi/`         | 测试/降级实现                    |
| `real_world_perception.py` | `api/cpi/`         | 🆕 真实世界感知 (时间/天气/新闻)  |
| `__init__.py`              | `api/cpi/`         | CPI 工厂 (自动检测+降级)         |
| `saihisis.json`            | `data/characters/` | ENTJ 角色配置                    |
| `main.py`                  | `api/`             | 主路由 (已注册桥接)              |

### 前端

| 文件                  | 位置                                 | 说明              |
| --------------------- | ------------------------------------ | ----------------- |
| `narrative-bridge.ts` | `stage-ui/src/stores/modules/`       | Pinia 通信 Store  |
| `CognitiveBubble.vue` | `stage-ui/src/components/cognitive/` | 认知可视化组件    |
| `chat.ts`             | `stage-ui/src/stores/`               | 对话管道 (已集成) |

### 脚本

| 文件                | 位置       | 说明           |
| ------------------- | ---------- | -------------- |
| `start_backend.sh`  | `scripts/` | 🆕 后端一键启动 |
| `start_frontend.sh` | `scripts/` | 🆕 前端一键启动 |

---

## 十、故障排查

| 症状                     | 原因                       | 解决                                               |
| ------------------------ | -------------------------- | -------------------------------------------------- |
| 气泡显示"连接中..."      | NarrativeEngine 未启动     | `./scripts/start_backend.sh`                       |
| `python3` 找不到 FastAPI | 使用了 pyenv 的系统 Python | 用 conda: `/Users/jifanliu/miniconda3/bin/python3` |
| 天气数据为空             | wttr.in 被墙/超时          | 正常降级，不影响功能                               |
| 增强 prompt 未注入       | narrative-bridge 未启用    | 气泡设置中启用                                     |
| LLM 无回复               | API key 失效               | 检查 Kimi key 和 model                             |
| 认知事件为空             | NE 模块未初始化            | CPI 自动降级到 Mock                                |
| WebSocket 断开           | 网络不稳或服务重启         | 自动重连 (5 秒间隔)                                |
