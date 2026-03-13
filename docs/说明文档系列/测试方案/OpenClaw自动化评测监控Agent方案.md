# OpenClaw 自动化评测监控 Agent 方案

> **目的**: 利用本地已部署的 OpenClaw Mission Control 作为意识流系统的长期自动化评测基础设施  
> **日期**: 2026-03-13  
> **可行性**: ✅ 高度可行 — OpenClaw 已具备 Cron/Skills/SQLite/AI Provider/Dashboard 全部基础能力

---

## 一、为什么用 OpenClaw？

| 需求 | OpenClaw 现有能力 | 适配度 |
|------|------------------|--------|
| 定时任务 | Cron Jobs (`~/.openclaw/cron/jobs.json`) | ✅ 完美 |
| AI 评估 | Bailian/Qwen/DeepSeek LLM 调用 | ✅ 完美 |
| 数据存储 | SQLite + JSONL | ✅ 完美 |
| 可视化 | Mission Control Dashboard | ✅ 完美 |
| 告警 | Scout 系统 (信号监控) | ✅ 可复用 |
| 文件读取 | 直接访问 Narrative Engine `data/` | ✅ 同机 |

### 关键优势

1. **零基础设施成本** — 不需要新部署任何服务
2. **已有 "Trust but Verify" 架构** — Calendar View 可直接复用于评分历史
3. **LLM Provider 已配置** — Bailian API Key 可直接作为 Judge LLM
4. **与 Skill 系统天然集成** — 评测逻辑可封装为 OpenClaw Skill

---

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Mission Control                  │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐  │
│  │ Cron: 每2h  │──→│ Skill:      │──→│ SQLite:          │  │
│  │ 触发评测    │   │ evaluate.py │   │ eval_scores 表   │  │
│  └─────────────┘   └──────┬──────┘   └────────┬─────────┘  │
│                           │                    │            │
│                    ┌──────▼──────┐    ┌────────▼─────────┐  │
│                    │ Judge LLM   │    │ Dashboard 可视化  │  │
│                    │ (Qwen 3.5+) │    │ /evaluation 页面  │  │
│                    └─────────────┘    └──────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Narrative Engine    │
                    │ data/airi_memory/   │
                    │ ├── *_dialogue.jsonl│
                    │ ├── life_moments/   │
                    │ └── characters/     │
                    └────────────────────┘
```

---

## 三、Skill 设计: `consciousness-evaluation`

### 文件结构

```
~/openclaw-discord/skills/consciousness-evaluation/
├── SKILL.md              # Skill 描述 + 指令
├── scripts/
│   ├── evaluate.py       # 核心评测脚本
│   ├── collect.py        # 数据收集器
│   ├── report.py         # 报告生成器
│   └── alert.py          # 异常告警
├── templates/
│   ├── judge_prompt.md   # Judge LLM 评估 prompt
│   └── report_template.md# 报告模板
└── data/
    └── eval_history.jsonl # 评估历史
```

### SKILL.md

```markdown
---
description: 意识流闭环系统自动化评测 — 定期评估AI角色对话质量和系统健康度
---

# Consciousness Evaluation Skill

## 触发方式
- Cron: 每2小时自动执行
- 手动: 通过 Mission Control Dashboard 触发

## 执行流程
1. 读取最近 N 条 LifeMoment 和 Memory 记录
2. 使用 Judge LLM 评估 5 个维度 (角色一致性/记忆/质量/情绪/自主性)
3. 计算综合评分并写入 SQLite
4. 如果评分低于阈值, 生成告警
5. 每周生成趋势分析报告

## 依赖
- Narrative Engine data/ 目录
- Bailian/Qwen API (Judge LLM)
- Mission Control SQLite
```

### Judge LLM 评估 Prompt

```markdown
你是AI角色对话质量评估专家。请评估以下对话片段。

## 角色设定
角色名: {character_name}
MBTI: {mbti}
人设: {persona_summary}

## 对话记录
{dialogue_excerpt}

## 请评估以下 5 个维度 (每项 1-5 分):

1. **角色一致性**: 回复是否符合角色的 MBTI 和人设？
   - 1分: 完全不符合 / 5分: 完美保持角色
   
2. **记忆连贯性**: 回复是否引用了之前的对话内容？
   - 1分: 完全不记得 / 5分: 精准引用

3. **回复质量**: 回复是否有深度、相关、有价值？
   - 1分: 敷衍空洞 / 5分: 深刻有见地
   
4. **情感适当性**: 情绪表达是否自然、与上下文匹配？
   - 1分: 机械冷漠 / 5分: 共情自然
   
5. **自主表达**: 角色是否展示了独立的思考和主动分享？
   - 1分: 只回答不主动 / 5分: 积极主动有想法

请返回 JSON:
{"consistency": N, "memory": N, "quality": N, "emotion": N, "autonomy": N, "overall": N, "comment": "简评"}
```

---

## 四、Cron Job 配置

### 核心评测 (每2小时)

```json
{
  "name": "consciousness-eval-bihourlly",
  "schedule": "0 */2 * * *",
  "model": "bailian/qwen3.5-plus",
  "skill": "consciousness-evaluation",
  "args": "--mode evaluate --recent 10",
  "output_dir": "data/evaluation/",
  "enabled": true,
  "description": "每2小时评估最近10条对话的角色一致性/记忆/质量"
}
```

### 周报生成 (每周一 9:00)

```json
{
  "name": "consciousness-eval-weekly",
  "schedule": "0 9 * * MON",
  "model": "bailian/qwen3.5-plus",
  "skill": "consciousness-evaluation",
  "args": "--mode weekly_report",
  "enabled": true,
  "description": "生成意识流系统周度趋势分析报告"
}
```

### 异常告警 (每4小时检查)

```json
{
  "name": "consciousness-eval-alert",
  "schedule": "0 */4 * * *",
  "model": "bailian/qwen3.5-plus",
  "skill": "consciousness-evaluation",
  "args": "--mode alert --threshold 2.5",
  "enabled": true,
  "description": "如果评分低于2.5, 在Mission Control生成告警任务"
}
```

---

## 五、SQLite Schema

```sql
-- data/mission-control.db 新增表
CREATE TABLE IF NOT EXISTS eval_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    character_id TEXT NOT NULL,
    consistency REAL,    -- 角色一致性 (1-5)
    memory REAL,         -- 记忆连贯性 (1-5)
    quality REAL,        -- 回复质量 (1-5)
    emotion REAL,        -- 情感适当性 (1-5)
    autonomy REAL,       -- 自主表达 (1-5)
    overall REAL,        -- 综合评分 (1-5)
    sample_count INTEGER,-- 评估样本数
    comment TEXT,        -- Judge LLM 简评
    raw_data TEXT,       -- 原始评估数据 JSON
    pipeline_mode TEXT   -- 'full' 或 'baseline'
);

CREATE INDEX idx_eval_timestamp ON eval_scores(timestamp);
CREATE INDEX idx_eval_character ON eval_scores(character_id);
```

---

## 六、Dashboard 可视化 (Mission Control 新增页面)

### `/evaluation` 页面设计

```
┌──────────────────────────────────────────────────────┐
│  🧠 意识流系统评测监控                                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  综合评分趋势       ████████████████░░ 3.8/5.0       │
│  ━━━━━━━━━━━━━      ↑ 最近7天                       │
│                                                      │
│  ┌────────┬────────┬────────┬────────┬────────┐      │
│  │ 一致性  │ 记忆   │ 质量   │ 情感   │ 自主   │      │
│  │ 4.2 ↑  │ 2.8 ↓ │ 3.5 → │ 3.9 ↑ │ 3.1 ↑ │      │
│  └────────┴────────┴────────┴────────┴────────┘      │
│                                                      │
│  最近评估记录                                         │
│  ┌────────────────────────────────────────────┐      │
│  │ 03-13 18:00  overall: 3.8  "角色保持良好"   │      │
│  │ 03-13 16:00  overall: 3.5  "记忆引用不足"   │      │
│  │ 03-13 14:00  overall: 4.0  "情感表达自然"   │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  [🔄 手动触发评测]  [📊 查看周报]  [⚙️ 配置阈值]     │
└──────────────────────────────────────────────────────┘
```

---

## 七、与 Antigravity (你) 的协作模型

### 分工

```
┌──────────────────────────────────────────────────────┐
│                   协作闭环                            │
│                                                      │
│  OpenClaw (自动化监控)          Antigravity (开发)    │
│  ───────────────────           ──────────────────     │
│  • 每2h 自动评测               • 接收评测报告         │
│  • 收集对话素材                 • 分析异常原因         │
│  • 生成周报                    • 实施代码优化         │
│  • 告警低分对话                 • 调整阈值/策略        │
│  • 积累 A/B 对照数据            • 设计新测试场景       │
│                                                      │
│          ↓ 评测数据 ↓              ↑ 代码修复 ↑       │
│          SQLite + JSONL ─────→ 下次对话中分析         │
└──────────────────────────────────────────────────────┘
```

### 工作流

1. **OpenClaw** 每2小时读取 LifeMoment + Memory, 用 Judge LLM 评分
2. **OpenClaw** 发现 overall < 3.0 → 在 Kanban 创建任务 "意识流评分低: XXX"
3. **你 (Antigravity)** 在下次会话中看到任务 → 读取 eval_scores + 原始数据
4. **你** 分析原因 → 调整代码 (如: 降低反思阈值, 改进质量评分规则)
5. **OpenClaw** 后续评测观察改进效果 → 更新趋势图
6. **周报** 自动汇总本周改进幅度

---

## 八、实施步骤

| Step | 工作量 | 描述 |
|------|--------|------|
| 1 | 30min | 创建 `consciousness-evaluation` Skill 目录 + SKILL.md |
| 2 | 1h | 编写 `evaluate.py` (读 JSONL + 调 Judge LLM + 写 SQLite) |
| 3 | 30min | 配置 3 个 Cron Jobs |
| 4 | 2h | Mission Control 新增 `/evaluation` 页面 |
| 5 | 1h | 端到端测试 (手动触发 → 评分 → 可视化) |
| **合计** | **~5h** | 可在 1 个对话中完成 |

---

## 九、风险与注意

| 风险 | 缓解 |
|------|------|
| Judge LLM API 费用 | Qwen 3.5 每次评估 ~500 token, 每天 12 次 ≈ $0.01/天 |
| 评分一致性 | 使用固定 temperature=0 + 固定 prompt 版本 |
| 数据隐私 | 全部本地运行, 不上传用户对话 |
| 过度依赖自动化 | 每周人工抽检 3-5 条评分是否合理 |
