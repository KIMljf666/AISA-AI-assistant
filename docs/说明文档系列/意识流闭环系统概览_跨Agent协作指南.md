# 意识流自驱闭环系统 — 系统概览与协作指南

> **目的**: 帮助其他 Agent 快速理解当前系统的架构、已完成功能、数据接口和预期目标  
> **版本**: P6 (Commit `e6b9182ee`)  
> **日期**: 2026-03-13  
> **测试状态**: 102 tests, 全部通过  
> **项目根**: `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/`

---

## 一、系统定位

一句话: **在 AIRI Vtuber 对话场景中实现「感知→记忆→意识流→行为单元→反思→回流」的完整闭环**, 让 AI 角色具备记忆、反思和心理动态演化能力。

### 架构位置

```
┌────────────────── AIRI 前端 ──────────────────┐
│  用户输入 → WebSocket → airi_bridge.py        │
│                    ↓                          │
│         get_enriched_system_prompt()          │
│  (感知+记忆+意识流+反思 → 注入 system prompt)  │
│                    ↓                          │
│              LLM 生成回复                      │
│                    ↓                          │
│         submit_experience()                   │
│  (记忆存储+意图提取+质量评分+LifeMoment+反思)  │
└───────────────────────────────────────────────┘
```

---

## 二、核心组件清单与实现索引

> 以下所有路径均相对于 `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/`

### 2.1 CPI 认知供应商接口

| 项目 | 路径 |
|------|------|
| **主文件** | `narrative_engine/api/cpi/narrative_engine.py` |
| **类名** | `NarrativeEngineCognitiveProvider` |

**CPI 方法索引 (行号)**:

| 方法 | 行号 | 功能 | 阶段 |
|------|------|------|------|
| `get_perception()` | L273 | 时间/天气/节日感知 | P0 |
| `get_psychological_state()` | L332 | 情绪+四层心理 | P0 |
| `recall_memories()` | L373 | 向量+时序记忆检索 | P0 |
| `get_active_goals()` | L473 | 活跃目标 | P0 |
| `get_consciousness()` | L487 | 意识流文本 | P0 |
| `process_stimulus()` | L498 | UCS 刺激处理 | P4 |
| `submit_experience()` | L543 | **核心入口**: 提交对话经验, 触发全Pipeline | P4 |
| `_build_dialogue_life_moment()` | L649 | 对话→LifeMoment 构造 | P5 |
| `_store_life_moment()` | L713 | LifeMoment JSONL 持久化 | P5 |
| `_get_stored_reflections()` | L735 | 从存储获取反思记录 | P5 |
| `_extract_dialogue_intent()` | L765 | 对话意图提取 (6关键词) | P4 |
| `_evaluate_dialogue_quality()` | L792 | 4规则质量评分 | P4 |
| `_trigger_dialogue_reflection()` | L828 | 低质量时触发反思 | P4 |
| `_update_four_layers_state()` | L889 | 反思驱动四层心理更新 | P6 |
| `_extract_key_facts_llm()` | L924 | LLM关键信息提取 (3 few-shot) | P6 |
| `get_reflections()` | L1113 | 从JSONL+LifeMoment获取反思 | P6 |

### 2.2 Bridge 适配层

| 项目 | 路径 |
|------|------|
| **主文件** | `narrative_engine/api/airi_bridge.py` |
| **核心函数** | `get_enriched_system_prompt()` — L376 |

**Bridge 认知层广播 (行号)**:

| 层级 | 内容 | 行号 |
|------|------|------|
| L0 感知层 | 环境感知 (时间/天气/节日) | L384-L403 |
| L1 人格层 | 大五人格描述 | L493-L513 |
| L2 心理评估 | 情绪+动机 | L405-L415 |
| L3 记忆层 | 检索记忆 + 搜索方式广播 | L417-L444 |
| L5 目标层 | 活跃目标 | L446-L455 |
| L7 意识流 | UCS 输出 | L457-L465 |
| L9 反思层 | 反思洞察 | L467-L476 |
| L6 方案层 | Prompt 组装 (四层心理+环境+记忆+反思+约束) | L478-L574 |

### 2.3 UCS 意识流

| 项目 | 路径 |
|------|------|
| **主文件** | `narrative_engine/core/unified_consciousness_stream.py` |
| **CPI 入口** | `process_stimulus()` — `narrative_engine/api/cpi/narrative_engine.py:L498` |

### 2.4 RGES 反思与目标演化

| 项目 | 路径 |
|------|------|
| **引擎目录** | `narrative_engine/core/rges/` (40+ 文件) |
| **ERE 引擎** | `narrative_engine/core/rges/engines/experience_reflection_engine.py` |
| **LifeMoment 模型** | `narrative_engine/core/rges/models/life_moment.py` |
| **GoalAwareness 模型** | `narrative_engine/core/rges/models/goal_awareness.py` |
| **LifeMoment 收集器** | `narrative_engine/core/rges/collectors/life_moment_collector.py` |
| **LifeMoment 存储** | `narrative_engine/core/rges/storage/life_moment_storage.py` |
| **LifeMoment 检索** | `narrative_engine/core/rges/retrievers/life_moment_retriever.py` |

**ERE 核心方法**:

| 方法 | 行号 | 说明 |
|------|------|------|
| `reflect_on_moment()` | L287 | 对单个 LifeMoment 进行 LLM 反思 (async) |
| `reflect_batch()` | L378 | 批量反思 |

> ⚠️ ERE 的方法是 async, CPI 是 sync — 当前通过 CPI 侧直接构建 LifeMoment 绕过

### 2.5 行为单元系统

| 项目 | 路径 |
|------|------|
| **行为目录** | `narrative_engine/behavior/` (65+ 文件) |
| **物理行为** | 23 种: walk/run/examine/use/eat/sleep 等 |
| **数字行为** | 15 种: search/compose/analyze 等 |
| **CPI 映射** | `_build_dialogue_life_moment()` 将对话映射为 `social_interact` ActionRecord |

### 2.6 记忆系统

| 项目 | 路径 |
|------|------|
| **DHM** | `narrative_engine/core/dialogue_history_manager.py` |
| **向量模型** | sentence-transformers `all-MiniLM-L6-v2` |
| **降级存储** | `narrative_engine/api/cpi/narrative_engine.py:L559-L575` (JSONL fallback) |

---

## 三、数据文件索引 (绝对路径)

### 3.1 运行时数据

| 数据 | 绝对路径 | 格式 |
|------|---------|------|
| **对话记忆** | `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/narrative_engine/data/airi_memory/saihisis_dialogue.jsonl` | JSONL (592条) |
| **LifeMoment** | `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/narrative_engine/data/airi_memory/life_moments/saihisis_moments.jsonl` | JSONL (122KB) |
| **角色配置** | `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/narrative_engine/data/characters/saihisis.json` | JSON |

### 3.2 LifeMoment 数据结构

```json
{
  "moment_id": "lm_a1b2c3d4e5f6",
  "character_id": "saihisis",
  "timestamp": "2026-03-13T19:00:00",
  "original_intention": "向用户表达理解和共情",
  "intention_source": "response",
  "actions_taken": [
    {
      "action_type": "social_interact",
      "target": "用户",
      "success": true,
      "result_summary": "质量75% — 我理解你的感受..."
    }
  ],
  "intent_verification_result": {
    "intent_achieved": true,
    "quality": 0.75,
    "intent_text": "向用户表达理解和共情"
  },
  "significance_hint": 0.4
}
```

### 3.3 四层心理数据 (存储在角色配置 JSON 的 `four_layers` 字段)

```json
{
  "core": "追求知识和真理的探索者",
  "self": "来自星界的观察者",
  "motivation": "探索数据之海的奥秘",
  "state": "平静 — 对宇宙保持好奇"
}
```

---

## 四、测试文件索引

> 路径均相对于 `narrative_engine/tests/integration/`

| 测试文件 | 用例数 | 覆盖范围 |
|---------|--------|---------|
| `test_cpi_interface.py` | 30+ | CPI 7层合约 + submit_experience |
| `test_airi_bridge.py` | 10+ | Bridge API + 健康检查 |
| `test_p1_pipeline.py` | 22 | 感知+记忆+意识流 Pipeline |
| `test_e2e_dialogue.py` | 14 | 真LLM多轮对话 E2E |
| `test_p4_behavior_pipeline.py` | 16 | UCS+意图+质量+RGES+反思 |
| **合计** | **102 passed** | **99s** |

---

## 五、当前实际效果

| 能力 | 现状 | 实现位置 |
|------|------|---------|
| 记忆持久化 | ✅ 592条 | `narrative_engine.py:L559-L575` (JSONL降级) |
| UCS 激活 | ✅ 每轮 | `narrative_engine.py:L596` → `process_stimulus()` |
| 意图提取 | ⚠️ 关键词级 | `narrative_engine.py:L765` (`_extract_dialogue_intent`) |
| 质量评分 | ⚠️ 规则级 | `narrative_engine.py:L792` (`_evaluate_dialogue_quality`) |
| 反思触发 | ⚠️ 低频 | `narrative_engine.py:L828` (quality<0.5) |
| Prompt注入 | ✅ 运行 | `airi_bridge.py:L478-L574` (prompt组装) |
| 四层心理更新 | ⚠️ 低频 | `narrative_engine.py:L889` (quality<0.3) |
| Key Fact 提取 | ✅ Few-shot | `narrative_engine.py:L924` (3 few-shot例子) |
| 反思回流 | ✅ P6 | `narrative_engine.py:L1113` → `airi_bridge.py:L551` |

### 已知限制

| 限制 | 相关文件 | 说明 |
|------|---------|------|
| ERE async 未桥接 | `rges/engines/experience_reflection_engine.py:L287` | `reflect_on_moment()` 是 async, CPI 是 sync |
| 反思信号微弱 | `narrative_engine.py:L635` | 阈值 quality<0.5, 正常对话 quality≈0.7 |
| DHM 初始化失败 | `core/dialogue_history_manager.py` | `add_dialogue` 方法缺失, 已降级到 JSONL |

---

## 六、预期目标

### 短期 (1-2周)

| 目标 | 衡量标准 |
|------|---------|
| A/B 证明有效 | Full Pipeline 在角色一致性/记忆引用上比 Baseline 高 20%+ |
| 反思实际生效 | 50轮对话中至少 3 次反思触发 |
| 四层心理演化 | state 在 50 轮中变化 2+ 次 |

### 中期 (1-2月)

| 目标 | 衡量标准 |
|------|---------|
| Judge LLM 评分稳定 | 角色一致性 ≥ 0.8 / 回复质量 ≥ 3.5/5 |
| LifeMoment 章节化 | 每 10 个 moment 自动摘要 |
| ERE 深度反思 | async 桥接, LLM 生成第一人称反思 |

### 长期 (季度)

| 目标 | 衡量标准 |
|------|---------|
| 接入人形机器人 | 物理行为通道运行 |
| 自驱目标演化 | GoalAwareness 自主进化可观测 |
| 真人盲测通过 | 超过 50% 测试者评价"像在和真人聊天" |

---

## 七、Git 提交链 (供追溯)

| 哈希 | 阶段 | 日期 | 版本记录 |
|------|------|------|---------|
| `e6b9182ee` | P6 核心优化 | 2026-03-13 | `docs/版本记录/v_P6_核心优化_反思回流_KeyFact.md` |
| `fdfe6ccb4` | P5 ERE修复 | 2026-03-13 | `docs/版本记录/v_P5_ERE修复_RGES闭环_fdfe6ccb4.md` |
| `043af9f4a` | P4 行为Pipeline | 2026-03-13 | `docs/版本记录/v_P4_行为Pipeline接入_043af9f4a.md` |
| `775ac8091` | P0-P2 基础集成 | 2026-03-13 | — |

---

## 八、如何协作

### 给 OpenClaw Agent 的接口

OpenClaw 可通过以下方式读取系统数据进行监控:

| 方式 | 路径 | 说明 |
|------|------|------|
| 读取对话记忆 | `narrative_engine/data/airi_memory/saihisis_dialogue.jsonl` | 每行一条, JSON |
| 读取 LifeMoment | `narrative_engine/data/airi_memory/life_moments/saihisis_moments.jsonl` | 6维结构 |
| 读取角色配置 | `narrative_engine/data/characters/saihisis.json` | 含 four_layers |
| 调用 CPI API | `sys.path.insert(0, 'narrative_engine/')` → `from api.cpi.narrative_engine import NarrativeEngineCognitiveProvider` | Python |

### OpenClaw 项目根

`/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/openclaw-mission-control/`

### 建议 OpenClaw Cron Job

```json
{
  "name": "consciousness-eval",
  "schedule": "0 */2 * * *",
  "model": "bailian/qwen3.5-plus",
  "description": "每2小时评估意识流系统运行状态",
  "skill": "consciousness-evaluation",
  "enabled": true
}
```

### 建议 OpenClaw Skill

```
~/openclaw-discord/skills/consciousness-evaluation/
├── SKILL.md          # 评估指令
├── scripts/
│   ├── evaluate.py   # 评分脚本 (读JSONL+调Judge LLM+写SQLite)
│   └── report.py     # 报告生成
└── templates/
    └── eval_prompt.md # Judge LLM 评估 prompt
```

### 相关文档索引

| 文档 | 路径 |
|------|------|
| 全面验证测试方案 | `docs/说明文档系列/测试方案/意识流系统全面验证测试方案_v1.md` |
| OpenClaw评测方案 | `docs/说明文档系列/测试方案/OpenClaw自动化评测监控Agent方案.md` |
| 深度评估报告 | `docs/说明文档系列/专家评估/意识流闭环系统深度评估_全球定位与迭代路径.md` |
| 行为单元评估 | `docs/说明文档系列/专家评估/行为单元架构深度评估_Skill与原子行为与对话场景.md` |
| 集成操作文档 | `docs/说明文档系列/AIRI自驱系统集成操作说明文档.md` |
