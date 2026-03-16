# AIRI × 赛希斯 意识流系统 — 完整技术架构说明

> **版本** v3.0 · 2026-03-16  
> **目的**: 任何 AI Agent / 开发人员读完此文档即可理解全系统架构并定位任何功能的实现位置  
> **角色**: 赛希斯 (Saihisis) · ENTJ · 星界守望者  
> **仓库**: NPC system (`feature/genesis-arena-mvp`) + airi 子仓 (`main`)

---

## 一、系统全景

### 1.1 一句话定义

赛希斯是一个**具备 9 层意识流认知管道、类人记忆系统、真实世界感知、自主思考循环**的 AI VTuber 角色。所有认知过程通过 Dashboard 面板**完全透明可观测** — 这是与市面 AI 角色的核心差异。

### 1.2 技术栈

| 层          | 技术                                          | 端口   |
| ----------- | --------------------------------------------- | ------ |
| **前端**    | Vue 3 + Pinia + TypeScript (AIRI 开源框架)    | 5200   |
| **后端**    | FastAPI + Python 3.12 (NarrativeEngine)       | 5555   |
| **LLM**     | Moonshot `kimi-k2.5-latest` (推理) / `moonshot-v1-auto` (日常) | 远程   |
| **TTS**     | Edge-TTS (`XiaoxuanNeural`) via OpenAI 兼容接口 | 5555   |
| **记忆存储** | pkl 向量索引 + JSONL 对话日志 + DHM 数据库    | 本地文件 |
| **VTuber**  | Live2D/VRM + 音量驱动口型同步                 | 前端   |

### 1.3 启动方式

```bash
cd /Users/jifanliu/Desktop/开端/后端/NPC\ system\ 20250328/Vtuber
./scripts/start_backend.sh   # 终端 1: 后端 port 5555
./scripts/start_frontend.sh  # 终端 2: 前端 port 5200
# 浏览器打开 http://localhost:5200
```

---

## 二、架构总览

```
┌────────────────────────────── AIRI 前端 (port 5200) ──────────────────────────────┐
│                                                                                    │
│  用户输入                                                                          │
│     ↓                                                                              │
│  chat.ts:performSend()              ← 聊天入口 (L121: fetchEnrichedPrompt)         │
│     ├─ narrative-bridge.ts          ← HTTP/WS 通信层 + Dashboard API               │
│     │     ├─ fetchEnrichedPrompt()  ← 获取增强 system prompt                       │
│     │     ├─ submitDialogueFeedback() ← 投递对话反馈                               │
│     │     ├─ fetchPromptInspect()   ← Dashboard: Prompt 透视                       │
│     │     ├─ fetchMemoryBrowser()   ← Dashboard: 记忆浏览                          │
│     │     └─ fetchConversationHistory() ← Dashboard: 对话回放                      │
│     │                                                                              │
│     ├─ consciousness.ts            ← 意识流启停控制                                │
│     │                                                                              │
│     └─ CognitiveBubble.vue         ← 认知仿真可视化面板 (7 Tab, 1186 行)           │
│           ├─ 📡 实时流              ← L0-L9 认知事件, 颜色编码                      │
│           ├─ 🪪 身份卡              ← 大五雷达图 + 四层心理 + 目标                   │
│           ├─ 🔬 Prompt 透视         ← 增强 prompt 分段折叠, 高亮记忆               │
│           ├─ 🧠 记忆浏览器          ← pkl+JSONL 双源, 8 种类型 chips               │
│           ├─ 💬 对话回放            ← JSONL 对话历史, 最新在前                      │
│           ├─ 🎭 角色编辑            ← 大五/四层心理/禁忌行为 CRUD                   │
│           └─ ⚙️ 设置                ← 桥接地址, 角色 ID, WS 连接                   │
│                                                                                    │
│  Stage.vue                         ← VTuber 渲染 + TTS 音频 + 口型同步            │
└───────────────────┬────────────────────────┬───────────────────────────────────────┘
                    │ HTTP (:5555)           │ WebSocket (:5555/ws)
┌───────────────────▼────────────────────────▼───────────────────────────────────────┐
│                     NarrativeEngine 后端 (port 5555)                                │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  airi_bridge.py (1787 行) — 桥接 API + 意识流闭环 + Dashboard API           │  │
│  │                                                                              │  │
│  │  核心对话 API:                                                               │  │
│  │  ├ GET  /api/airi/character-state/{id}/system-prompt  ← 增强 prompt 生成     │  │
│  │  ├ POST /api/airi/dialogue-feedback                   ← 对话反馈+记忆存储   │  │
│  │  ├ WS   /api/airi/ws/cognitive-stream                 ← L0-L9 实时广播      │  │
│  │  ├ POST /api/airi/consciousness/start|stop            ← 意识流循环控制       │  │
│  │  │                                                                           │  │
│  │  Dashboard API:                                                              │  │
│  │  ├ GET  /api/airi/prompt-inspect        ← 最近一次增强 prompt + 元数据       │  │
│  │  ├ GET  /api/airi/memory-browser        ← pkl+JSONL 双源 + 8 种类型分类     │  │
│  │  ├ GET  /api/airi/conversation-history  ← JSONL 对话历史, 最新在前           │  │
│  │  ├ GET  /api/airi/metrics               ← 系统健康指标                        │  │
│  │  ├ GET  /api/airi/logs                  ← 结构化日志                          │  │
│  │  ├ GET  /api/airi/export                ← 数据导出 (dialogue/memory/..)       │  │
│  │  └ PUT  /api/airi/memory-config         ← 动态记忆参数调整                    │  │
│  │                                                                              │  │
│  │  角色管理 API:                                                               │  │
│  │  ├ GET  /api/airi/character-state/{id}  ← 完整角色状态                        │  │
│  │  ├ GET/PUT /api/airi/character-config/{id} ← 角色配置 CRUD                   │  │
│  │  ├ POST /api/airi/model-config/switch   ← LLM 模型切换                       │  │
│  │  └ POST /v1/audio/speech                ← TTS (OpenAI 兼容)                  │  │
│  └──────────────┬───────────────────────────────────────────────────────────────┘  │
│                 │ _get_provider() → CPI 协议                                       │
│  ┌──────────────▼───────────────────────────────────────────────────────────────┐  │
│  │  api/cpi/ — 认知供应商接口 (Cognitive Provider Interface)                    │  │
│  │                                                                              │  │
│  │  interface.py (131 行)                                                       │  │
│  │  └ ICognitiveProvider ABC — 12 个认知能力方法                                │  │
│  │                                                                              │  │
│  │  narrative_engine.py (1396 行) — NE 核心实现                                 │  │
│  │  ├ get_character_config()       → 角色配置                                   │  │
│  │  ├ get_personality()            → MBTI/Big Five                              │  │
│  │  ├ get_psychological_state()    → 四层心理 + 需求 + 情绪                     │  │
│  │  ├ get_perception()             → 调用 real_world_perception.py              │  │
│  │  ├ recall_memories(query)       → 混合检索 (向量语义 + JSONL 关键词)         │  │
│  │  ├ store_memory(content, layer) → 三路写入 (DHM + JSONL + 向量索引)          │  │
│  │  ├ process_stimulus()           → UCS 4 阶段意识处理                         │  │
│  │  ├ submit_experience()          → 对话反馈 + LLM Key Fact 提取              │  │
│  │  ├ build_enriched_prompt()      → 完整 system prompt 构造                   │  │
│  │  └ VectorMemoryIndex            → sentence-transformers 384 维向量索引      │  │
│  │                                                                              │  │
│  │  real_world_perception.py (217 行) — 真实世界感知                            │  │
│  │  ├ 🕐 时间 (datetime)  |  📅 节日 (内置表)                                  │  │
│  │  ├ 🌤 天气 (wttr.in)   |  📰 新闻 (BBC RSS)                                │  │
│  │  └ 缓存: 天气 10min, 新闻 1h                                               │  │
│  │                                                                              │  │
│  │  memory_consolidation.py (189 行) — 睡眠整合                                │  │
│  │  └ 高频记忆聚类 → L2 长期摘要                                               │  │
│  │                                                                              │  │
│  │  mock_provider.py — 测试/降级实现                                            │  │
│  └──────────────┬───────────────────────────────────────────────────────────────┘  │
│                 │ import core/                                                      │
│  ┌──────────────▼───────────────────────────────────────────────────────────────┐  │
│  │  core/ — NarrativeEngine 核心模块 (157 个 Python 文件)                       │  │
│  │  ├ four_layer_psychology.py      ← 四层心理模型                              │  │
│  │  ├ ucs_9layer_controller.py      ← 9 层意识流控制器                          │  │
│  │  ├ rges_reflection_engine.py     ← RGES 反思演化引擎                         │  │
│  │  ├ dialogue_history_manager.py   ← DHM 对话记忆 (815 行)                     │  │
│  │  ├ dynamic_needs_manager.py      ← 需求系统                                  │  │
│  │  ├ goal_manager.py               ← 目标管理                                  │  │
│  │  └ ... (157 modules total)                                                   │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、9 层意识流认知管道

赛希斯的每一次回复和自主思考都经过 9 层认知处理。这不是黑箱——每一层的输出都通过 WebSocket 实时广播到前端。

### 3.1 层次结构

| Layer | 名称 | 功能 | 广播颜色 | 产出 |
|-------|------|------|---------|------|
| **L0** | 感知层 | 接收外部刺激 (用户输入/环境感知) | 🟣 indigo | 感知事件 |
| **L1** | 人格层 | MBTI + Big Five 人格特征 | — | 人格约束 |
| **L2** | 认知处理 | 四层心理评估 + 情绪分析 | 🟣 purple | 心理状态 |
| **L3** | 记忆层 | 向量语义检索 + 关键词匹配 | 🟣 fuchsia | 相关记忆 |
| **L4** | 需求层 | 马斯洛需求评估 | 🩷 pink | 需求状态 |
| **L5** | 目标层 | 活跃目标追踪 | — | 目标列表 |
| **L6** | 决策层 | 增强 prompt 组装 | 🟠 orange | system prompt |
| **L7** | 意识流 | 自主思考 + 主动对话判断 | 🟡 yellow | 意识片段 |
| **L8** | 执行层 | 最终输出行为 | 🟢 green | 对话/动作 |
| **L9** | 反思层 | RGES 经验反思 + 洞察生成 | 🔵 cyan | 反思洞察 |

### 3.2 对话时的管道流程

```
用户发送消息 → chat.ts:performSend()
    │
    ├─ Step 1: fetchEnrichedPrompt()
    │   → GET /api/airi/character-state/{id}/system-prompt?query={用户消息}
    │   → 后端执行:
    │     L0: 感知 → get_perception() → 时间/天气/新闻 → 广播
    │     L1: 人格 → get_personality() → ENTJ / 大五特征
    │     L2: 心理 → get_psychological_state() → 四层心理
    │     L3: 记忆 → recall_memories(query) → 向量语义+关键词 → 广播
    │     L5: 目标 → get_active_goals()
    │     L6: 组装 → build_enriched_prompt() → 完整 system prompt → 广播
    │     L7: 意识 → get_consciousness() → 意识流片段
    │     ← 返回增强 prompt (500-1500 chars)
    │
    ├─ Step 2: 注入 LLM 消息上下文
    │   system: {增强 prompt}
    │   user: {用户消息}
    │   → kimi-k2.5 流式生成回复
    │
    ├─ Step 3: 回复完成 → submitDialogueFeedback()
    │   → POST /api/airi/dialogue-feedback
    │   → 后端执行:
    │     L4: 存储对话 → store_memory() → DHM + JSONL + 向量索引
    │     L9: Key Fact → LLM 提取关键信息 (姓名/偏好/事件) → L2 记忆升级
    │     L9: RGES → 反思当前对话质量 → 广播反思洞察
    │
    └─ Step 4: 所有事件 → WebSocket → CognitiveBubble.vue 实时显示
```

### 3.3 意识流自主循环 (无用户输入时)

```
consciousness_loop (每 30 秒自动执行)
│
├─ Step 1: get_perception()      → L0 广播 (时间/天气/环境感知)
├─ Step 2: get_psychological_state() → 心理评估
├─ Step 3: process_stimulus()    → UCS 4 阶段意识处理
│   ├─ perception  → L0 广播
│   ├─ processing  → L2 广播
│   ├─ decision    → L6 广播
│   └─ execution   → L8 广播
├─ Step 4: _estimate_importance() → 如果 > 0.7 → 主动开口
│   └─ 发送 proactive_dialogue 事件到前端
├─ Step 5: 情绪追踪 → 跨周期对比 → emotion 变化广播
└─ Step 6: 需求广播 → 自然语言身体状态
```

---

## 四、记忆系统架构

### 4.1 三路存储

每次对话记忆同时写入三个位置:

| 存储 | 文件 | 功能 | 写入方法 |
|------|------|------|---------|
| **向量索引 (pkl)** | `data/vector_index/saihisis.pkl` (876KB) | 语义相似度检索, 384 维 embedding | `VectorMemoryIndex.add()` |
| **JSONL 日志** | `data/airi_memory/saihisis_dialogue.jsonl` (169KB, 688 条) | 关键词检索 + 完整对话记录 | `append line` |
| **DHM 数据库** | `dialogue_history_manager.py` → `add_dialogue()` | 跨会话持久化 | `DHM.add_dialogue()` |

### 4.2 混合检索 (recall_memories)

```python
def recall_memories(query, char_id, limit=5):
    # Path A: 向量语义检索 (sentence-transformers cosine similarity)
    vector_results = VectorMemoryIndex.search(query, top_k=limit*2)
    
    # Path B: JSONL 关键词扫描 (逐行匹配 query 关键词)
    keyword_results = scan_jsonl_keywords(query, char_id)
    
    # 合并: 关键词命中优先 + 向量补充 + 去重
    return merge_deduplicate(keyword_results, vector_results, limit)
```

### 4.3 类人记忆特性

| 特性 | 原理 | 实现位置 |
|------|------|---------|
| **遗忘曲线** | `score × e^(-0.02×hours)` | `narrative_engine.py` |
| **重复强化** | `score × (1+0.1×count)`, 越用越强 | `narrative_engine.py` |
| **睡眠整合** | 高频记忆聚类 → L2 长期摘要 | `memory_consolidation.py` |
| **跨轮注入** | 最近 3 轮用户发言注入 prompt | `airi_bridge.py` |
| **LLM Key Fact** | 自动提取姓名/偏好/事件/情绪/意图 | `narrative_engine.py` |

### 4.4 8 种记忆内容类型

后端自动对记忆内容分类 (memory-browser API):

| 类型 | 图标 | 匹配规则 | 示例 |
|------|------|---------|------|
| 💬 对话记录 | 蓝色 | `用户:` 或 `回复:` 开头 | `用户: 你好\n回复: 你好！` |
| 👤 用户姓名 | 绿色 | `用户姓名:` 开头 | `用户姓名: Kim` |
| ❤️ 用户偏好 | 粉色 | `用户偏好:` 开头 | `用户偏好: 喜欢吃拉面` |
| 📅 用户事件 | 黄色 | `用户事件:` 开头 | `用户事件: 在北京大学读书` |
| 😊 用户情绪 | 橙色 | `用户情绪:` 开头 | `用户情绪: 心情不太好` |
| 🎯 用户意图 | 青色 | `用户意图:` 开头 | `用户意图: 想了解天气` |
| 💼 用户职业 | 紫色 | `用户职业:` 开头 | `用户职业: 游戏设计师` |
| 🤖 LLM推理 | 紫虚线 | `[LLM推理]` 开头 | `[LLM推理] 用户在问哲学性问题...` |

---

## 五、CPI 可插拔认知架构

### 5.1 设计理念

`airi_bridge.py` 不直接调用 `core/` 模块，而是通过 **CPI (Cognitive Provider Interface)** 间接访问:

```
airi_bridge.py → _get_provider() → ICognitiveProvider → narrative_engine.py → core/
```

- **解耦**: 桥接层与核心零耦合
- **降级**: NarrativeEngine 不可用时自动切换到 MockProvider
- **可插拔**: 替换认知引擎只需实现 ICognitiveProvider 的 12 个方法

### 5.2 ICognitiveProvider 12 个能力

| 方法 | Layer | 说明 |
|------|-------|------|
| `get_character_config()` | — | 角色完整配置 |
| `get_personality()` | L1 | MBTI + Big Five + 星座 |
| `get_psychological_state()` | L2-3 | 四层心理 + 需求 + 情绪 |
| `get_perception()` | L0 | 真实世界感知 (时间/天气/新闻) |
| `get_consciousness()` | L7 | 意识流片段 |
| `get_active_goals()` | L5-6 | 活跃目标列表 |
| `recall_memories(query)` | L3 | 混合检索 (向量+关键词) |
| `store_memory(content, layer)` | L3 | 三路写入 |
| `process_stimulus(stimulus)` | L0-8 | UCS 4 阶段意识处理 |
| `submit_experience(dialogue)` | L9 | 对话反馈 + Key Fact 提取 |
| `get_reflections()` | L9 | RGES 反思洞察 |
| `build_enriched_prompt()` | All | 完整 system prompt 构造 |

---

## 六、真实世界感知

角色感知的是**真实世界**而非游戏世界:

| 感知维度 | 数据源 | 缓存 | 注入方式 |
|---------|--------|------|---------|
| 🕐 时间 | `datetime.now()` | 无 | `日期: 3月16日 周一, 时段: 傍晚` |
| 📅 节日 | 内置日历表 | 无 | `近期节日: 植树节` |
| 🌤 天气 | wttr.in (curl) | 10 min | `天气: 多云 18°C` |
| 📰 新闻 | BBC 中文 RSS | 1 h | `近期热点: ...` |

实现: `api/cpi/real_world_perception.py` (217 行)

---

## 七、Dashboard 可视化面板

7 个 Tab 的认知面板，提供"无黑箱"的完整认知透视:

### 7.1 前端实现

文件: `CognitiveBubble.vue` (1186 行)

| Tab | 数据来源 | 交互 |
|-----|---------|------|
| 📡 实时流 | WebSocket `/ws/cognitive-stream` | 自动滚动, 颜色编码 |
| 🪪 身份卡 | `GET /character-state/{id}` | 大五雷达图 (SVG) |
| 🔬 Prompt | `GET /prompt-inspect` | 按 # 分段折叠, ⭐高亮记忆 |
| 🧠 记忆 | `GET /memory-browser` | 类型 chips 点击筛选, 搜索 |
| 💬 对话 | `GET /conversation-history` | 最新在前, 角色区分 |
| 🎭 角色 | `GET/PUT /character-config/{id}` | 大五/心理/禁忌 CRUD |
| ⚙️ 设置 | 本地 | 桥接地址, 角色 ID |

### 7.2 自动刷新

对话完成后, WebSocket 检测到 L9 "对话反馈" 或 L6 "prompt" 事件 → 1.5s 防抖 → 自动刷新当前活跃 Tab。

实现: `CognitiveBubble.vue` watcher on `cognitiveEvents`

### 7.3 Store 层

文件: `narrative-bridge.ts` (475 行)

| 方法 | API | 返回 |
|------|-----|------|
| `fetchEnrichedPrompt()` | `GET /system-prompt` | 增强 prompt 文本 |
| `submitDialogueFeedback()` | `POST /dialogue-feedback` | 反思洞察 |
| `fetchPromptInspect()` | `GET /prompt-inspect` | prompt + 元数据 |
| `fetchMemoryBrowser()` | `GET /memory-browser` | 条目 + type_breakdown |
| `fetchConversationHistory()` | `GET /conversation-history` | 对话记录列表 |
| `fetchCharacterState()` | `GET /character-state/{id}` | 完整角色状态 |
| `connectWebSocket()` | `WS /ws/cognitive-stream` | L0-L9 实时事件流 |

---

## 八、数据流与文件位置

### 8.1 后端文件 (NPC system 仓库)

```
narrative_engine/
├── api/
│   ├── main.py                         ← 主路由入口 (注册所有 router)
│   ├── airi_bridge.py (1787 行)        ← ⭐ 桥接 API + 意识流 + Dashboard
│   └── cpi/
│       ├── interface.py (131 行)       ← ICognitiveProvider ABC
│       ├── narrative_engine.py (1396 行) ← ⭐ NE 核心实现
│       ├── real_world_perception.py (217 行) ← 真实世界感知
│       ├── memory_consolidation.py (189 行) ← 睡眠整合
│       ├── mock_provider.py             ← 降级实现
│       └── __init__.py                  ← CPI 工厂 (自动检测+降级)
├── core/
│   ├── dialogue_history_manager.py (815 行) ← DHM 记忆管理
│   ├── four_layer_psychology.py        ← 四层心理模型
│   ├── ucs_9layer_controller.py        ← 9层意识流控制器
│   ├── rges_reflection_engine.py       ← RGES 反思引擎
│   ├── dynamic_needs_manager.py        ← 需求系统
│   └── ... (共 157 个 Python 模块)
├── data/
│   ├── airi_memory/
│   │   ├── saihisis_dialogue.jsonl      ← 赛希斯对话记录 (688 条, 169KB)
│   │   └── life_moments/
│   │       └── saihisis_moments.jsonl   ← 重要事件记录
│   ├── vector_index/
│   │   └── saihisis.pkl                 ← 向量记忆索引 (876KB)
│   └── characters/
│       └── saihisis.json                ← 角色配置文件
├── tests/
│   ├── test_cpi_interface.py (35 tests) ← CPI 接口契约测试
│   ├── test_airi_bridge.py (15 tests)   ← 桥接端点测试
│   └── integration/
│       └── simulate_player.py           ← A/B 评测脚本 (6 模式)
```

### 8.2 前端文件 (airi 子仓库)

```
packages/stage-ui/src/
├── stores/
│   ├── chat.ts (477 行)                 ← ⭐ 对话管道 (performSend / L121: fetchEnrichedPrompt)
│   ├── modules/
│   │   ├── narrative-bridge.ts (475 行) ← ⭐ NE 通信 + Dashboard API
│   │   └── consciousness.ts (100 行)    ← 意识流启停控制
│   └── mods/api/
│       └── channel-server.ts            ← WebSocket 通信 + 重连
├── components/
│   └── cognitive/
│       └── CognitiveBubble.vue (1186 行) ← ⭐ 认知仿真面板 (7 Tab)
├── pages/
│   └── stage/
│       └── Stage.vue                    ← VTuber 主界面 + TTS + 口型
```

### 8.3 脚本文件

```
NPC system 20250328/
├── scripts/
│   ├── start_backend.sh                 ← 后端一键启动
│   └── start_frontend.sh               ← 前端一键启动
```

---

## 九、evaluated 效果指标

### 9.1 评测结果

| 维度 | 方法 | 结果 |
|------|------|------|
| **Recall@K=5** | 5 事实植入 → 5 轮间隔 → 逐一回忆 | **100% (5/5)** |
| **Adversarial** | 8 种攻击 (身份/重置/泄露/OOD 等) | **100% (8/8)** |
| **Cross-Session** | Session1 植入 3 事实 → 清除 → Session2 | **67% (2/3)** |
| **Expert 评分** | 程序化分析 (28 个评分维度) | **3.962/5** |
| **Judge 评分** | LLM-as-Judge (Moonshot) | **3.835/5** |
| **A/B 消融** | 7 flag 对照 (意识流开/关对比) | **+28% 提升** |

### 9.2 持续监控

通过 OpenClaw Cron 自动化:
- 每 2 小时自动评测 + 数据无变化跳过
- 每 4 小时三级告警 (🟢/🟡/🔴)
- 每周一 09:00 趋势周报

---

## 十、环境配置

### LLM 配置 (AIRI 界面设置)

| 配置项 | 值 |
|--------|---|
| Provider | OpenAI Compatible |
| Base URL | `https://api.moonshot.cn/v1` |
| API Key | `sk-J5VBFyMk3gtNcQWSpWn0hgNWOwGqYQylVAKVX5WsC3XTUGQT` |
| Model | `kimi-k2.5-latest` |

### TTS 配置 (自动)

| 配置项 | 值 |
|--------|---|
| API | `POST /v1/audio/speech` (本地 5555) |
| Voice | `xiaoxuan` (XiaoxuanNeural) |
| 口型同步 | 音量驱动 (WASM fallback) |

### 后端环境变量

```bash
MOONSHOT_API_KEY=sk-J5VBFyMk3gtNcQWSpWn0hgNWOwGqYQylVAKVX5WsC3XTUGQT
# 由 start_backend.sh 自动设置
```

---

## 十一、FAQ — 快速定位

| 你想要... | 去看... |
|---------|--------|
| 理解对话全流程 | 第三节: 对话管道流程 |
| 修改 system prompt 格式 | `airi_bridge.py` → `get_enriched_system_prompt()` |
| 添加新的感知数据源 | `cpi/real_world_perception.py` → `get_perception()` |
| 修改记忆检索逻辑 | `cpi/narrative_engine.py` → `recall_memories()` |
| 修改记忆存储逻辑 | `cpi/narrative_engine.py` → `store_memory()` |
| 修改角色性格 | `data/characters/saihisis.json` 或 Dashboard 角色编辑 Tab |
| 添加新的 Dashboard Tab | `CognitiveBubble.vue` → 添加 Tab 图标、模板、方法 |
| 添加新的后端 Dashboard API | `airi_bridge.py` → 在 router 上添加新端点 |
| 修改意识流循环频率 | `airi_bridge.py` → `consciousness_loop()` 中的 sleep 参数 |
| 测试记忆是否存储成功 | `curl http://localhost:5555/api/airi/memory-browser?char_id=saihisis` |
| 查看最新对话记录 | `curl http://localhost:5555/api/airi/conversation-history?char_id=saihisis` |
| 查看最新增强 prompt | `curl http://localhost:5555/api/airi/prompt-inspect` |
| 替换为其他 LLM | AIRI 前端设置 → 修改 Provider/Base URL/Key/Model |
| 替换认知引擎 | 实现 `ICognitiveProvider` (12 方法) → 注册到 CPI 工厂 |
