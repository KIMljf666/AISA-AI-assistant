# 赛希斯效果验证 — MVP角色驱动模拟测试方案

> **版本**: v1.0  
> **日期**: 2026-03-14  
> **前置**: 意识流闭环系统 P0-P6 已跑通 (102 tests), 首次评测 1.83/5  
> **目标**: 用 MVP 竞技场角色的真实游戏数据喂入 AIRI 意识流管线, 验证赛希斯回复质量是否因此显著提升  
> **项目根**: `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/`

> [!CAUTION]
> **数据安全红线**: 本方案中所有对 MVP 角色数据的访问均为 **只读 (READ-ONLY)**。
> 严禁直接修改 `genesis_arena.db` 或 MVP 后端的任何数据文件。
> 所有派生数据写入 AIRI 侧独立目录, 与 MVP 产品完全隔离。

---

## 一、测试要验证什么

| # | 核心问题 | 判定标准 | 当前基线 |
|---|---------|---------|---------|
| 1 | 赛希斯有了角色游戏数据后, 回复是否 **更符合角色人设** ? | 角色一致性 ≥ 3.5/5 | 2/5 |
| 2 | 赛希斯能否 **引用角色的过往经历** (装备/死亡/层数) ? | 记忆引用率 ≥ 30% | 1/5 |
| 3 | 赛希斯的 **情感表达** 是否因了解角色状况而更自然 ? | 情感适当性 ≥ 4/5 | 3/5 |
| 4 | 赛希斯的 **四层心理** 是否随角色游戏进度演化 ? | state 在 50 轮中变化 2+ 次 | 未测 |
| 5 | 赛希斯回复比 **纯 LLM 无数据背景** 时是否有显著差异 ? | A/B 总分差 ≥ 20% | 未测 |

---

## 二、为什么用 MVP 角色而不是 NE 角色

| 维度 | NE 角色 (林静宜等) | MVP 角色 (竞技场) | 选择理由 |
|------|-------------------|------------------|---------|
| 数据结构 | UUID 目录 × 20+ 子目录 | 单条 SQLite JSON | ✅ MVP 更简单, 无需适配 20+ 目录 |
| 可用数量 | 5个 (数据旧) | **不断创建** | ✅ MVP 自然积累 |
| 游戏行为数据 | 无 (纯社交NPC) | 战斗/装备/死亡/层数/日记 | ✅ MVP 有丰富的可叙事素材 |
| 心理模型 | 完整 (120+ 文件) | 简化 (MBTI+base_stats) | ⚠️ 需初始化 `four_layers` |
| 与 AIRI 接口兼容 | 需写 UUID→JSONL 适配器 | 需写 SQLite→JSONL 桥接 | 持平, 但 MVP 更轻量 |

---

## 三、架构设计 — 只读桥接

```
MVP 产品 (不触碰)                    AIRI 意识流管线
─────────────────                   ─────────────────
genesis_arena.db                    
  └─ characters collection          
     └─ Character JSON  ──(只读)──→ ① character_bridge.py
                                        ↓ (提取+转换)
                                    ② airi_memory/mvp_{name}/
                                       ├── character.json      (人设+four_layers)
                                       ├── game_context.json   (装备/层数/死亡)
                                       └── moments.jsonl       (LifeMoment)
                                        ↓
                                    ③ 对话模拟脚本
                                       simulate_player.py
                                        ↓
                                    ④ AIRI 管线 (CPI → Bridge → LLM)
                                        ↓
                                    ⑤ 评测 (OpenClaw Cron / Judge LLM)
```

> [!IMPORTANT]
> **① 只读**: `character_bridge.py` 通过 `database.get_character()` 读取, 不调用 `save_character()`  
> **② 独立目录**: 所有派生数据写入 `airi_memory/mvp_{name}/`, 不影响 `saihisis` 现有数据  
> **③ 模拟对话**: 脚本生成的对话写入 AIRI 侧, 不回写 MVP

---

## 四、实施步骤

### Step 1: 桥接脚本 `character_bridge.py` (~80行)

**功能**: 从 MVP SQLite **只读**提取角色 → 生成 AIRI 所需文件

```python
# 伪代码 — 核心逻辑
def bridge_character(character_id: str):
    # ① 只读获取 MVP 角色
    char = db.get_character(character_id)  # READ-ONLY
    
    # ② 构造 AIRI character.json (含 four_layers 初始化)
    airi_char = {
        "name": char.name,
        "mbti": char.mbti,
        "worldview": char.worldview,
        "background": char.background,
        "four_layers": {
            "core": f"一个来自{char.worldview}世界的{char.mbti}外来者",
            "self": f"深渊探索者, 最高到达第{char.roguelike_highest_floor}层",
            "motivation": _infer_motivation(char),  # 从游戏数据推断
            "state": _infer_state(char),            # 从最近战斗推断
        },
        "game_stats": {  # ← AIRI 独有, 供 Prompt 注入
            "highest_floor": char.roguelike_highest_floor,
            "death_count": char.death_count,
            "equipment_count": len(char.equipment),
            "best_equipment": _get_best_equipment(char),
            "diary_highlights": _extract_diary_highlights(char),
        }
    }
    
    # ③ 将游戏事件转为 LifeMoment
    moments = []
    for diary in char.diary_entries:
        moments.append(_diary_to_life_moment(char, diary))
    
    # ④ 写入 AIRI 侧独立目录 (NOT MVP目录)
    output_dir = AIRI_MEMORY_DIR / f"mvp_{char.name}"
    write_json(output_dir / "character.json", airi_char)
    write_jsonl(output_dir / "moments.jsonl", moments)
```

### Step 2: 对话模拟脚本 `simulate_player.py` (~150行)

**功能**: 基于角色游戏状态生成模拟玩家对话, 喂入 AIRI 管线

```python
# 对话场景模板 — 基于角色实际数据动态生成
SCENARIOS = {
    "post_death": [
        "我又死了...第{death_count}次了",
        "赛希斯, 你说我是不是太菜了",
        "这次死在第{floor}层, 好不甘心",
    ],
    "got_legendary": [
        "看看我刚拿到的{equipment_name}！",
        "传说装备！有{affix}效果！",
    ],
    "deep_abyss": [
        "第{floor}层了, 越来越难了",
        "这个世界观的敌人好强",
    ],
    "casual": [
        "赛希斯, 你觉得我应该走哪条路？",
        "今天的深渊好难打",
        "你还记得我上次怎么死的吗？",  # ← 测试记忆
    ],
}
```

### Step 3: A/B 对照执行

```bash
# Baseline: 纯 LLM (无游戏数据, 无意识流)
python simulate_player.py \
  --character-id 12b82136-9d69-40e9-8e57-423a6d6869df \
  --mode baseline \
  --turns 20

# Full Pipeline: 完整管线 (游戏数据+意识流+记忆+反思)
python simulate_player.py \
  --character-id 12b82136-9d69-40e9-8e57-423a6d6869df \
  --mode full_pipeline \
  --turns 20
```

### Step 4: OpenClaw 自动评测

复用已设计的 Cron Job, 只需指向新目录:

```json
{
  "name": "mvp-csis-eval",
  "schedule": "0 */2 * * *",
  "model": "bailian/qwen3.5-plus",
  "args": "--character mvp_{name} --recent 10",
  "description": "评估MVP角色驱动的赛希斯对话质量"
}
```

---

## 五、路径索引

### 5.1 MVP 侧 (⚠️ 只读)

| 资源 | 绝对路径 | 访问方式 |
|------|---------|---------|
| MVP 数据库 | `narrative_engine/mvp/genesis-arena/data/genesis_arena.db` | **只读** SQLite |
| Character 模型 | `narrative_engine/mvp/genesis-arena/backend/models.py` (L120-L250) | 参考 |
| Database API | `narrative_engine/mvp/genesis-arena/backend/database.py` | `get_character()` 只读 |
| 装备模型 | `narrative_engine/mvp/genesis-arena/backend/models.py` (L80-L116) | 参考 |
| 测试角色 ID | `12b82136-9d69-40e9-8e57-423a6d6869df` | 当前测试主角色 |

> [!CAUTION]
> 上表所有资源均为 **只读访问**。禁止调用 `save_character()`, `save_run()` 或直接写入 `genesis_arena.db`。

### 5.2 AIRI 侧 (可读写)

| 资源 | 绝对路径 | 说明 |
|------|---------|------|
| CPI 主文件 | `narrative_engine/api/cpi/narrative_engine.py` | 意识流管线入口 |
| Bridge | `narrative_engine/api/airi_bridge.py` | `get_enriched_system_prompt()` |
| 赛希斯配置 | `narrative_engine/data/characters/saihisis.json` | 含 `four_layers` |
| 赛希斯对话 | `narrative_engine/data/airi_memory/saihisis_dialogue.jsonl` | 592条 |
| 赛希斯 LifeMoment | `narrative_engine/data/airi_memory/life_moments/saihisis_moments.jsonl` | JSONL |
| **MVP 桥接输出** | `narrative_engine/data/airi_memory/mvp_{name}/` | 🆕 本方案新建 |
| A/B 基线开关 | Commit #90 `569d2f040` — 7个 Pipeline flag | 已实装 |
| ERE 引擎 | `narrative_engine/core/rges/engines/experience_reflection_engine.py` | async |
| LifeMoment 模型 | `narrative_engine/core/rges/models/life_moment.py` | 数据结构 |

### 5.3 OpenClaw 侧

| 资源 | 绝对路径 | 说明 |
|------|---------|------|
| Mission Control | `openclaw-mission-control/` | Cron/Skills/Dashboard |
| 评测 Skill 目录 | `~/openclaw-discord/skills/consciousness-evaluation/` | 待创建 |
| 评测结果 | `Vtuber/airi/docs/评测结果/` | Markdown 报告 |
| Cron 配置 | `~/.openclaw/cron/jobs.json` | 定时任务 |

### 5.4 已有测试方案文档

| 文档 | 路径 |
|------|------|
| 意识流验证测试方案 v1 | `Vtuber/airi/docs/说明文档系列/测试方案/意识流系统全面验证测试方案_v1.md` |
| OpenClaw 评测方案 | `Vtuber/airi/docs/说明文档系列/测试方案/OpenClaw自动化评测监控Agent方案.md` |
| 评测方式说明 | `Vtuber/airi/docs/评测结果/评测方式说明_Cron数据源.md` |
| 系统概览协作指南 | `Vtuber/airi/docs/说明文档系列/意识流闭环系统概览_跨Agent协作指南.md` |
| AI 互动深度设计 | `narrative_engine/mvp/genesis-arena/docs/方案设计/AI互动与装备情感化深度设计.md` |

---

## 六、MVP Character → AIRI 数据映射表

| MVP 字段 | AIRI 用途 | 转换方式 |
|----------|----------|---------|
| `char.mbti` | `character.json` → 角色 MBTI | 直接复制 |
| `char.worldview` | `character.json` → 世界观 | 直接复制 |
| `char.background` | `character.json` → 背景故事 | 直接复制 |
| `char.life_experience` | `character.json` → 生命经历 | 提取关键事件 |
| `char.roguelike_highest_floor` | `game_stats.highest_floor` | 直接复制 |
| `char.death_count` | `game_stats.death_count` | 直接复制 |
| `char.equipment[]` | `game_stats.best_equipment` | 取 rarity 最高 3 件 |
| `char.diary_entries[]` | `moments.jsonl` | 每条日记 → 1 个 LifeMoment |
| `char.floor_logs[]` | `moments.jsonl` | 每条战斗速记 → 1 个 LifeMoment |
| `char.elo` / `char.pvp_wins` | `game_stats.pvp_record` | 汇总统计 |
| _(无)_ | `four_layers` | 🆕 由桥接脚本**推断初始化** |

### LifeMoment 转换示例

```json
// MVP diary_entry:
{
  "floor": 5, "trigger_reason": "chapter",
  "chapter": "第二章 · 觉醒", "content": "深渊第五层的战斗让我...",
  "chapter_theme": "觉醒"
}

// → AIRI LifeMoment:
{
  "moment_id": "lm_mvp_diary_5",
  "character_id": "mvp_{name}",
  "timestamp": "2026-03-14T15:00:00",
  "original_intention": "外来者在深渊第5层完成了觉醒章节",
  "intention_source": "game_event",
  "actions_taken": [{
    "action_type": "social_interact",
    "target": "深渊",
    "success": true,
    "result_summary": "深渊第五层的战斗让我..."
  }],
  "intent_verification_result": {
    "intent_achieved": true,
    "quality": 0.8,
    "intent_text": "深渊探索 — 第5层觉醒"
  },
  "significance_hint": 0.7
}
```

---

## 七、预期产出

| 阶段 | 产出 | 耗时 |
|------|------|------|
| Step 1 | `character_bridge.py` + MVP→AIRI 数据 | ~1h |
| Step 2 | `simulate_player.py` + 4 场景脚本 | ~1.5h |
| Step 3 | A/B 对照结果 (Baseline vs Full) | ~1h |
| Step 4 | OpenClaw Cron Job 配置 + 首次评测 | ~0.5h |
| **合计** | **端到端可运行的验证环境** | **~4h** |

### 成功标准

| 指标 | Baseline (纯LLM) | Full Pipeline | 目标差距 |
|------|------------------|---------------|---------|
| 角色一致性 | ~2.5/5 | ≥ 3.5/5 | +40% |
| 记忆引用率 | ~5% | ≥ 30% | +25pp |
| 情感适当性 | ~3/5 | ≥ 4/5 | +33% |
| 综合 | ~2.5/5 | ≥ 3.5/5 | +40% |

---

> **维护说明**: 每次新增测试角色或更新管线后更新本文档。所有路径均相对于项目根 `/Users/jifanliu/Desktop/开端/后端/NPC system 20250328/`。
