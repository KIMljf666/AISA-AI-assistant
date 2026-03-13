# 意识流自驱闭环系统 — 系统概览与协作指南

> **目的**: 帮助其他 Agent 快速理解当前系统的架构、已完成功能、数据接口和预期目标  
> **版本**: P6 (Commit `e6b9182ee`)  
> **日期**: 2026-03-13  
> **测试状态**: 102 tests, 全部通过

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

## 二、核心组件清单

| 组件 | 文件 | 功能 | 状态 |
|------|------|------|------|
| **CPI** | `narrative_engine/api/cpi/narrative_engine.py` | 认知供应商接口, 7层认知管道 | ✅ P6 |
| **Bridge** | `narrative_engine/api/airi_bridge.py` | AIRI ↔ NE 适配层, prompt 组装 | ✅ P6 |
| **UCS** | `narrative_engine/core/unified_consciousness_stream.py` | 9层因果链意识流 | ✅ 可激活 |
| **RGES** | `narrative_engine/core/rges/` | 反思+目标演化 (40+ 文件) | ⚠️ ERE async未桥接 |
| **行为单元** | `narrative_engine/behavior/` | 65+ 文件, 23物理+15数字行为 | ✅ 架构完整 |
| **记忆** | `narrative_engine/core/data_bus/dialogue_history_manager.py` | L2-L4分层+向量检索 | ✅ JSONL降级运行 |

---

## 三、数据接口 (供其他Agent读取)

### 3.1 记忆数据

| 路径 | 格式 | 内容 |
|------|------|------|
| `data/airi_memory/{char}_dialogue.jsonl` | JSONL | 每行一条记忆, 含 content/layer/timestamp |
| `data/airi_memory/life_moments/{char}_moments.jsonl` | JSONL | LifeMoment 6维数据 (意图/行为/结果/他者/状态/环境) |
| `data/characters/{char}.json` | JSON | 角色配置 (personality/four_layers/speech_patterns) |

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

### 3.3 四层心理数据

```json
{
  "core": "追求知识和真理的探索者",
  "self": "来自星界的观察者",
  "motivation": "探索数据之海的奥秘",
  "state": "平静 — 对宇宙保持好奇"
}
```

### 3.4 CPI API

| 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `get_perception(char_id)` | str | Dict | 时间/天气/节日 |
| `get_psychological_state(char_id)` | str | Dict | 情绪+四层心理 |
| `recall_memories(char_id, limit)` | str, int | List[Dict] | 向量+时序检索 |
| `get_active_goals(char_id)` | str | List[Dict] | 活跃目标 |
| `get_consciousness(char_id)` | str | str | 意识流文本 |
| `get_reflections(char_id, limit)` | str, int | List[Dict] | 反思洞察 |
| `submit_experience(char_id, exp)` | str, Dict | Dict | 提交对话经验, 触发Pipeline |
| `process_stimulus(char_id, text)` | str, str | Dict | UCS 刺激处理 |

---

## 四、当前实际效果

| 能力 | 现状 | 说明 |
|------|------|------|
| 记忆持久化 | ✅ 592条 | JSONL 文件, 跨会话保留 |
| UCS 激活 | ✅ 每轮 | `process_stimulus` 自动调用 |
| 意图提取 | ⚠️ 关键词级 | 6个标记词匹配, 非语义理解 |
| 质量评分 | ⚠️ 规则级 | 4条规则 (长度/空洞/禁忌/覆盖) |
| 反思触发 | ⚠️ 低频 | quality<0.5才触发, 正常对话不触发 |
| Prompt注入 | ✅ 运行 | 反思+记忆+四层心理+目标 |
| 四层心理更新 | ⚠️ 低频 | quality<0.3才更新 state/motivation |

### 已知限制

1. **ERE async 未桥接** — `ExperienceReflectionEngine.reflect_on_moment()` 是 async, CPI 是 sync
2. **反思信号微弱** — 正常对话 quality≈0.7, 绝大多数不触发反思
3. **无 A/B 对照数据** — 无法证明系统增量价值
4. **无真实用户测试** — 全部数据来自自动化测试

---

## 五、预期目标

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

## 六、Git 提交链 (供追溯)

| 哈希 | 阶段 | 日期 |
|------|------|------|
| `e6b9182ee` | P6 核心优化 | 2026-03-13 |
| `fdfe6ccb4` | P5 ERE修复 | 2026-03-13 |
| `043af9f4a` | P4 行为Pipeline | 2026-03-13 |
| `775ac8091` | P0-P2 基础集成 | 2026-03-13 |

---

## 七、如何协作

### 给 OpenClaw Agent 的接口

OpenClaw 可通过以下方式读取系统数据进行监控:

1. **直接读取 JSONL** — `data/airi_memory/` 下所有文件
2. **调用 CPI Python API** — 通过 `sys.path` import
3. **读取角色配置** — `data/characters/{char}.json`

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
│   ├── evaluate.py   # 评分脚本
│   └── report.py     # 报告生成
└── templates/
    └── eval_prompt.md # Judge LLM 评估 prompt
```
