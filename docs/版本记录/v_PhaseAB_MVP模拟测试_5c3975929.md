# 版本说明 — MVP角色驱动模拟测试 (Phase A+B + Step 1-3)

> **日期**: 2026-03-14  
> **Commits**: kaiduan-NPC `5c3975929` / AISA `09da9394` / openclaw-discord (consciousness-evaluation)  
> **前序**: Phase 7-9 (`6d399741`), P0-P6 闭环

---

## 一、Phase A: A/B 基线开关 ✅

### 新增

| 文件 | 内容 |
|------|------|
| `narrative_engine.py` | 7 个 pipeline_flags + `set_pipeline_mode()` + `get_pipeline_flags()` |
| `airi_bridge.py` | `get_enriched_system_prompt()` 尊重 flags + `/pipeline-mode` API |
| `test_ab_baseline.py` | 8 个 A/B 单元测试 |

### 测试

- 原有 102 tests + 新增 8 tests = **110 全通过** (98s)

---

## 二、Phase B: OpenClaw 评测 Skill ✅

### 新增

| 文件 | 内容 |
|------|------|
| `skills/consciousness-evaluation/SKILL.md` | 评测说明 |
| `skills/consciousness-evaluation/scripts/evaluate.py` | Judge LLM 5维评分 |

### 首次真实数据评测

| 维度 | 得分 |
|------|------|
| 角色一致性 | 2/5 |
| 记忆连贯性 | 1/5 |
| 综合 | **1.83/5** |

> 低分原因: 592条测试数据 (非真实对话)

---

## 三、Step 1: MVP→AIRI 只读桥接 ✅

### 新增

| 文件 | 内容 |
|------|------|
| `character_bridge.py` | 只读 SQLite → AIRI 格式转换 |

### 功能

- `_infer_motivation()`: 从层数/死亡推断动机
- `_infer_state()`: 从最近战绩推断心理状态
- Diary → LifeMoment, FloorLog → LifeMoment
- 输出到 `airi_memory/mvp_{name}/` 独立目录

### 验证

角色 `37` (ENTP/玄幻): 24 LifeMoments (8 diary + 16 floor_logs)

---

## 四、Step 2-3: 对话模拟 + A/B 对照 ✅

### 新增

| 文件 | 内容 |
|------|------|
| `simulate_player.py` | 数据驱动模拟对话 + Judge 评分 + A/B 报告 |

### A/B 首次对照结果

| 指标 | Baseline | Full Pipeline |
|------|----------|---------------|
| System Prompt | 56 chars | 419 chars |
| 记忆存储 | ❌ | ✅ |
| 意识流处理 | ❌ | ✅ |
| RGES 反思 | ❌ | ✅ |
| Judge 评分 | 5/5 | 5/5 |

> **定性差异显著**: Full Pipeline 引用具体游戏事件 (紫府令旗/第10层/死亡完结篇), Baseline 仅通用回复。
> **Judge 校准待优化**: 5/5 满分过于宽容, 需引入更严格的评分标准。

### 评测报告

- `评测结果/ab_mvp_37_20260314_175600.md`

---

## 后续方向

1. **Judge 校准**: 使用 stricter prompt + 多 Judge 交叉评分
2. **Cron 配置**: OpenClaw 定时评测 + 每日模拟对话
3. **多角色测试**: 桥接更多 MVP 角色
4. **长会话测试**: 50+ 轮深度测试
