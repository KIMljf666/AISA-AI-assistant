# 版本记录 — P5 ERE方法修复 + RGES闭环生效

## Commit fdfe6ccb4 | 2026-03-13 18:52

> **分支**: `feature/genesis-arena-mvp`  
> **基于**: Commit `043af9f4a` (P4 行为Pipeline接入)

### 远程仓库

| 仓库 | 哈希 | 远程 |
|------|------|------|
| kaiduan-NPC (Parent) | `fdfe6ccb4` | feature/genesis-arena-mvp |

### 主要内容

**P5: ERE 方法名修复 — RGES 闭环真正生效**

| 修复项 | 之前 | 之后 |
|--------|------|------|
| `rges_triggered` | ❌ False (调用不存在的方法) | ✅ True |
| `insights` | 0 items | 1+ items |

| 新方法 | 功能 |
|--------|------|
| `_build_dialogue_life_moment` | 从对话构建标准 LifeMoment (6维填充) |
| `_store_life_moment` | JSONL 持久化到 `data/airi_memory/life_moments/` |
| `_get_stored_reflections` | 从存储中检索反思洞察 |

**根因**: ERE 实际 API 是 `reflect_on_moment(LifeMoment)` (async)，而 CPI 调用的 `submit_experience()` 和 `get_recent_reflections()` 不存在。修复策略: CPI 侧直接构建并持久化 LifeMoment，绕过 ERE 的 async 限制。

### 测试结果

| 全套 | 结果 |
|------|------|
| 100 passed + 2 skipped | ✅ (118s) |
