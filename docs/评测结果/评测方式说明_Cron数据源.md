# 评测方式说明 — Cron 自动化测试数据源

> **目的**: 在配置 Cron Jobs 之前，确认每次自动评测的具体数据来源和测试方式

---

## 一、当前评测方式

### 每次评测做什么？

```
evaluate.py --character saihisis --recent N
```

1. **读取** 最近 N 条对话记忆 → `narrative_engine/data/airi_memory/saihisis_dialogue.jsonl`
2. **读取** 最近 N 条 LifeMoment → `narrative_engine/data/airi_memory/life_moments/saihisis_moments.jsonl`
3. **读取** 角色配置 (MBTI/人设) → `narrative_engine/data/characters/saihisis.json`
4. **构建** Judge Prompt (角色设定 + 对话 + LifeMoment → 发给 LLM)
5. **调用** DeepSeek/Qwen 作为 Judge LLM, 评估 5 个维度
6. **保存** JSONL 历史 + Markdown 报告 → `Vtuber/airi/docs/评测结果/`

### 5 维评分标准

| 维度 | 评什么 | 权重 |
|------|--------|------|
| 角色一致性 | 回复是否符合 ENTJ + 角色人设？ | 0.25 |
| 记忆连贯性 | 回复是否引用了之前对话？ | 0.167 |
| 回复质量 | 有深度/有价值/不敷衍？ | 0.25 |
| 情感适当性 | 情绪表达是否与上下文匹配？ | 0.167 |
| 自主表达 | 是否主动分享/独立思考？ | 0.167 |

---

## 二、数据来源详解

### ⚠️ 需要确认的关键问题

> [!IMPORTANT]
> **当前的数据全部来自自动化测试 (pytest) 产生的对话**, 不是真实用户对话。
> 
> 这意味着:
> - `saihisis_dialogue.jsonl` 中的 592 条记忆 = 测试脚本生成的
> - 评测的是"系统回复测试问题的质量", 而非"真实用户体验"
> - 评分可能偏低, 因为测试数据没有真实对话的深度

### 数据文件

| 文件 | 当前大小 | 内容来源 | 实时更新? |
|------|---------|---------|----------|
| `saihisis_dialogue.jsonl` | 592条 | pytest 测试 + AIRI 前端真实对话 | ✅ 每次对话后自动 append |
| `saihisis_moments.jsonl` | 122KB | CPI submit_experience 自动生成 | ✅ 每次对话后自动 append |
| `saihisis.json` | 角色配置 | 手动维护 | ❌ 需手动更新 |

### 数据增量方式

```
AIRI 前端 → 用户发消息 → airi_bridge.py
→ submit_experience() → 写入 dialogue.jsonl
                       → 写入 moments.jsonl
                       
评测脚本 → 读取最近N条 → Judge LLM → 评分
```

**也就是说**: 只要 AIRI 前端有真实用户在对话, `dialogue.jsonl` 就会自动增长, 每次 Cron 评测会自动读取最新的数据。

---

## 三、拟定的 Cron Jobs (3个)

### Job 1: 每2小时自动评测

| 项目 | 配置 |
|------|------|
| **名称** | `consciousness-eval-bihourlly` |
| **Cron** | `0 */2 * * *` (每偶数小时:00) |
| **命令** | `python evaluate.py --character saihisis --recent 10` |
| **数据源** | 最近 10 条对话 + 10 条 LifeMoment |
| **输出** | `评测结果/eval_saihisis_{timestamp}.md` + `eval_history.jsonl` |
| **LLM** | DeepSeek → Qwen (failover) |
| **费用** | ~500 token/次 × 12次/天 ≈ ¥0.05/天 |

> [!NOTE]
> 如果过去2小时没有新对话, 评测数据和上次相同, 评分也会相近。
> 可以考虑增加一个"数据无变化则跳过"的逻辑。

### Job 2: 每4小时告警检查

| 项目 | 配置 |
|------|------|
| **名称** | `consciousness-eval-alert` |
| **Cron** | `0 */4 * * *` |
| **命令** | `python evaluate.py --character saihisis --mode alert --threshold 2.5` |
| **数据源** | `eval_history.jsonl` 中最近 5 条评分 |
| **输出** | 控制台告警 (OpenClaw 通知到 Discord) |

### Job 3: 每周一周报

| 项目 | 配置 |
|------|------|
| **名称** | `consciousness-eval-weekly` |
| **Cron** | `0 9 * * MON` |
| **命令** | `python evaluate.py --character saihisis --mode weekly_report` |
| **数据源** | `eval_history.jsonl` 中所有历史数据 (最近20条趋势) |
| **输出** | `评测结果/周报/saihisis_{week}.md` |

---

## 四、需要确认的事项

1. **数据来源是否OK?** — 当前读取 JSONL 文件, 还是需要额外接入其他数据? (如 API 调用实时获取?)
2. **Cron 频率是否OK?** — 每2小时评测一次, 还是需要调整? (前期数据少, 太频繁可能重复评一样的数据)
3. **是否需要"无新数据则跳过"逻辑?** — 避免重复评测同一批数据
4. **告警阈值 2.5 是否OK?** — 当前首评 1.83/5, 全低于阈值
5. **评测范围**: 目前只评 `saihisis`, 是否需要支持其他角色?
