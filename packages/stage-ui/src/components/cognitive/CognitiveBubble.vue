<script setup lang="ts">
/**
 * 认知仿真可视化气泡窗口  v2.0
 *
 * 🆕 Phase 8: 认知透明深度增强
 * - 静态/动态分离: 身份卡面板 vs 实时事件流
 * - 记忆溯源展开: 点击展开记忆详情
 * - 记忆涟漪动画: memory_recall 事件视觉波纹
 * - 因果连线: 同批次事件竖线连接
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useNarrativeBridgeStore, LAYER_COLORS, LAYER_ICONS } from '../../stores/modules/narrative-bridge'

const store = useNarrativeBridgeStore()
const {
  cognitiveEvents,
  connected,
  showCognitiveBubble,
  enabled,
  latestEvent,
  isConsciousnessActive,
  lastCharacterState,
} = storeToRefs(store)

const collapsed = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const activeTab = ref<'stream' | 'identity' | 'character' | 'settings'>('stream')

// Phase 6 P1: Draggable window
const dragPos = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const hasCustomPosition = ref(false)

function onDragStart(e: MouseEvent) {
  if (collapsed.value) return
  isDragging.value = true
  const bubble = (e.currentTarget as HTMLElement).parentElement!
  const rect = bubble.getBoundingClientRect()
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return
  hasCustomPosition.value = true
  dragPos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.value.x)),
    y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.value.y)),
  }
}

function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

const bubbleStyle = computed(() => {
  if (!hasCustomPosition.value) return {}
  return {
    bottom: 'auto',
    right: 'auto',
    left: `${dragPos.value.x}px`,
    top: `${dragPos.value.y}px`,
  }
})

// Phase 5f: Character config editor
const { characterConfig, configSaving } = storeToRefs(store)
const editConfig = ref<Record<string, any> | null>(null)
const configStatus = ref('')

async function loadConfig() {
    const cfg = await store.fetchCharacterConfig()
    if (cfg)
        editConfig.value = JSON.parse(JSON.stringify(cfg))
}

async function saveConfig() {
    if (!editConfig.value) return
    configStatus.value = '保存中...'
    const updates: Record<string, any> = {}
    if (editConfig.value.name) updates.name = editConfig.value.name
    if (editConfig.value.personality) updates.personality = editConfig.value.personality
    if (editConfig.value.four_layers) updates.four_layers = editConfig.value.four_layers
    if (editConfig.value.speech_patterns) updates.speech_patterns = editConfig.value.speech_patterns
    const ok = await store.saveCharacterConfig(updates)
    configStatus.value = ok ? '✅ 已保存' : '❌ 保存失败'
    setTimeout(() => configStatus.value = '', 2000)
}

function resetConfig() {
    if (characterConfig.value)
        editConfig.value = JSON.parse(JSON.stringify(characterConfig.value))
}

function addForbidden() {
    if (editConfig.value?.speech_patterns)
        editConfig.value.speech_patterns.forbidden = [...(editConfig.value.speech_patterns.forbidden || []), '']
}

function removeForbidden(idx: number) {
    if (editConfig.value?.speech_patterns?.forbidden)
        editConfig.value.speech_patterns.forbidden.splice(idx, 1)
}

// 🆕 Phase 8: 记忆溯源展开
const expandedMemoryIdx = ref<number | null>(null)
function toggleMemoryExpand(idx: number) {
  expandedMemoryIdx.value = expandedMemoryIdx.value === idx ? null : idx
}

// Phase 6 P1: Layer-sorted events (L0→L1→…→L9 within same batch)
const recentEvents = computed(() => {
  const events = cognitiveEvents.value.slice(-30)
  const batches = new Map<string, typeof events>()
  for (const e of events) {
    const key = e.timestamp.substring(0, 19)
    if (!batches.has(key)) batches.set(key, [])
    batches.get(key)!.push(e)
  }
  const sorted: typeof events = []
  for (const [, batch] of batches) {
    batch.sort((a, b) => a.layer - b.layer)
    sorted.push(...batch)
  }
  return sorted
})

// 🆕 Phase 8: 判断事件是否在同一批次中有后续事件 (用于因果连线)
function isInCausalChain(idx: number): boolean {
  if (idx >= recentEvents.value.length - 1) return false
  const current = recentEvents.value[idx]
  const next = recentEvents.value[idx + 1]
  return current.timestamp.substring(0, 19) === next.timestamp.substring(0, 19)
}

const connectionStatus = computed(() => {
  if (!enabled.value) return { text: '已禁用', color: '#6b7280' }
  if (connected.value) return { text: '已连接', color: '#22c55e' }
  return { text: '连接中...', color: '#eab308' }
})

function getLayerColor(layer: number): string {
  return LAYER_COLORS[layer] ?? '#9ca3af'
}

function getEventIcon(type: string): string {
  return LAYER_ICONS[type] ?? '💬'
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

// 🆕 Phase 8: 大五人格雷达图计算
function getRadarPoints(bigFive: Record<string, number> | undefined): string {
  if (!bigFive) return ''
  const dims = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']
  const cx = 60, cy = 60, r = 45
  return dims.map((dim, i) => {
    const angle = (Math.PI * 2 * i / 5) - Math.PI / 2
    const val = (bigFive[dim] ?? 0.5) * r
    return `${cx + val * Math.cos(angle)},${cy + val * Math.sin(angle)}`
  }).join(' ')
}

function getRadarAxisPoints(idx: number): string {
  const cx = 60, cy = 60, r = 45
  const angle = (Math.PI * 2 * idx / 5) - Math.PI / 2
  return `${cx},${cy} ${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
}

const radarLabels = [
  { key: 'openness', label: '开放', short: 'O' },
  { key: 'conscientiousness', label: '尽责', short: 'C' },
  { key: 'extraversion', label: '外向', short: 'E' },
  { key: 'agreeableness', label: '宜人', short: 'A' },
  { key: 'neuroticism', label: '神经质', short: 'N' },
]

// Auto-scroll to bottom
watch(cognitiveEvents, () => {
  if (autoScroll.value) {
    nextTick(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
      }
    })
  }
}, { deep: true })

onMounted(() => {
  if (enabled.value) {
    store.connectWebSocket()
  }
})

onUnmounted(() => {
  store.disconnectWebSocket()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showCognitiveBubble"
      class="cognitive-bubble"
      :class="{ collapsed, dragging: isDragging }"
      :style="bubbleStyle"
    >
      <!-- 标题栏 (可拖拽) -->
      <div class="bubble-header" @mousedown="onDragStart" @click.self="collapsed = !collapsed">
        <div class="header-left" @click="collapsed = !collapsed">
          <span class="pulse-dot" :style="{ background: connectionStatus.color }" />
          <span class="header-title">🧠 认知仿真</span>
          <span class="header-status">{{ connectionStatus.text }}</span>
        </div>
        <div class="header-right">
          <span v-if="isConsciousnessActive" class="consciousness-badge">意识活跃</span>
          <button class="collapse-btn" @click.stop="collapsed = !collapsed">{{ collapsed ? '▲' : '▼' }}</button>
        </div>
      </div>

      <!-- 内容区 -->
      <div v-if="!collapsed" class="bubble-content">
        <!-- Tab 栏 -->
        <div class="tab-bar">
          <button
            v-for="tab in (['stream', 'identity', 'character', 'settings'] as const)"
            :key="tab"
            class="tab-btn"
            :class="{ active: activeTab === tab }"
            @click="() => { activeTab = tab; if (tab === 'character' && !editConfig) loadConfig(); if (tab === 'identity' && !lastCharacterState) store.fetchCharacterState() }"
          >
            {{ tab === 'stream' ? '📡 实时流' : tab === 'identity' ? '🪪 身份卡' : tab === 'character' ? '🎭 角色' : '⚙️ 设置' }}
          </button>
        </div>

        <!-- 📡 实时流 (带因果连线) -->
        <div v-if="activeTab === 'stream'" ref="scrollContainer" class="event-stream">
          <div
            v-for="(event, idx) in recentEvents"
            :key="idx"
            class="event-item"
            :class="{
              'causal-chain': isInCausalChain(idx),
              'memory-ripple': event.event_type === 'memory_recall',
              'proactive-event': event.event_type === 'proactive_dialogue'
            }"
          >
            <div class="event-layer" :style="{ background: getLayerColor(event.layer) }">
              L{{ event.layer }}
            </div>
            <div class="event-body">
              <div class="event-meta">
                <span class="event-icon">{{ getEventIcon(event.event_type) }}</span>
                <span class="event-layer-name">{{ event.layer_name }}</span>
                <span class="event-time">{{ formatTime(event.timestamp) }}</span>
              </div>
              <div class="event-content">{{ event.content }}</div>
              <!-- 🆕 Task 3: 记忆溯源展开 -->
              <div
                v-if="event.event_type === 'memory_recall' && event.metadata?.memories?.length"
                class="memory-expand-trigger"
                @click="toggleMemoryExpand(idx)"
              >
                {{ expandedMemoryIdx === idx ? '▼ 收起记忆详情' : `▸ 展开 ${event.metadata.memories.length} 条记忆` }}
                <span v-if="event.metadata?.search_method" class="search-method-badge">{{ event.metadata.search_method === 'vector' ? '🔍 语义' : '📝 关键词' }}</span>
              </div>
              <div v-if="expandedMemoryIdx === idx && event.metadata?.memories" class="memory-expand-panel">
                <div v-for="(mem, mi) in event.metadata.memories" :key="mi" class="memory-trace-item">
                  <span class="mem-layer-tag">{{ mem.layer || 'L4' }}</span>
                  <span class="mem-content">{{ mem.content }}</span>
                  <span v-if="mem.score" class="mem-score">{{ (mem.score * 100).toFixed(0) }}%</span>
                  <span v-if="mem.timestamp" class="mem-time">{{ mem.timestamp.substring(11, 19) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="recentEvents.length === 0" class="empty-state">
            等待认知事件...
          </div>
        </div>

        <!-- 🆕 Phase 8: 🪪 身份卡面板 (静态信息) -->
        <div v-if="activeTab === 'identity'" class="identity-panel">
          <template v-if="lastCharacterState">
            <!-- 角色头部 -->
            <div class="identity-header">
              <div class="identity-avatar">{{ lastCharacterState.name?.charAt(0) || '?' }}</div>
              <div class="identity-info">
                <h3 class="identity-name">{{ lastCharacterState.name }}</h3>
                <div class="identity-tags">
                  <span class="id-tag mbti">{{ lastCharacterState.personality?.mbti }}</span>
                  <span class="id-tag zodiac">{{ lastCharacterState.personality?.zodiac }}</span>
                </div>
              </div>
            </div>

            <!-- 大五人格雷达图 -->
            <div v-if="lastCharacterState.personality?.big_five" class="radar-section">
              <h4 class="section-title">🧬 人格图谱</h4>
              <div class="radar-container">
                <svg viewBox="0 0 120 120" class="radar-chart">
                  <!-- 背景网格 -->
                  <polygon v-for="scale in [0.2, 0.4, 0.6, 0.8, 1.0]" :key="scale"
                    :points="[0,1,2,3,4].map(i => {
                      const a = (Math.PI*2*i/5) - Math.PI/2
                      return `${60+45*scale*Math.cos(a)},${60+45*scale*Math.sin(a)}`
                    }).join(' ')"
                    fill="none" :stroke="`rgba(139,92,246,${scale*0.3})`" stroke-width="0.5"
                  />
                  <!-- 轴线 -->
                  <polyline v-for="i in 5" :key="`axis-${i}`"
                    :points="getRadarAxisPoints(i-1)"
                    stroke="rgba(139,92,246,0.15)" stroke-width="0.5"
                  />
                  <!-- 数据多边形 -->
                  <polygon
                    :points="getRadarPoints(lastCharacterState.personality?.big_five)"
                    fill="rgba(139,92,246,0.2)" stroke="#8b5cf6" stroke-width="1.5"
                  />
                  <!-- 数据点 -->
                  <circle v-for="(dim, i) in radarLabels" :key="`dot-${i}`"
                    :cx="60 + (lastCharacterState.personality?.big_five?.[dim.key] ?? 0.5) * 45 * Math.cos((Math.PI*2*i/5)-Math.PI/2)"
                    :cy="60 + (lastCharacterState.personality?.big_five?.[dim.key] ?? 0.5) * 45 * Math.sin((Math.PI*2*i/5)-Math.PI/2)"
                    r="2.5" fill="#a78bfa"
                  />
                </svg>
                <!-- 标签 -->
                <div class="radar-labels">
                  <div v-for="(dim, i) in radarLabels" :key="dim.key" class="radar-label" :class="`pos-${i}`">
                    {{ dim.label }} <span class="radar-val">{{ ((lastCharacterState.personality?.big_five?.[dim.key] ?? 0) * 100).toFixed(0) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 四层心理卡片 -->
            <div class="layers-grid">
              <div class="layer-card core">
                <span class="layer-icon">💎</span>
                <span class="layer-label">核心价值观</span>
                <p class="layer-value">{{ lastCharacterState.four_layers?.core }}</p>
              </div>
              <div class="layer-card self">
                <span class="layer-icon">🪞</span>
                <span class="layer-label">身份认同</span>
                <p class="layer-value">{{ lastCharacterState.four_layers?.self }}</p>
              </div>
              <div class="layer-card motivation">
                <span class="layer-icon">🔥</span>
                <span class="layer-label">当前动机</span>
                <p class="layer-value">{{ lastCharacterState.four_layers?.motivation }}</p>
              </div>
              <div class="layer-card emotion">
                <span class="layer-icon">💗</span>
                <span class="layer-label">情绪状态</span>
                <p class="layer-value">{{ lastCharacterState.four_layers?.state }}</p>
              </div>
            </div>

            <!-- 目标进度 -->
            <div v-if="lastCharacterState.goals?.length" class="goals-section">
              <h4 class="section-title">🎯 活跃目标</h4>
              <div v-for="(goal, i) in lastCharacterState.goals" :key="i" class="goal-item">
                <span class="goal-priority">P{{ goal.priority }}</span>
                <span class="goal-desc">{{ goal.description }}</span>
                <div class="goal-progress">
                  <div class="goal-bar" :style="{ width: `${goal.progress * 100}%` }" />
                </div>
              </div>
            </div>

            <!-- 需求仪表盘 -->
            <div v-if="lastCharacterState.needs" class="needs-section">
              <h4 class="section-title">🫀 身体状态</h4>
              <div class="needs-grid">
                <div v-for="(val, key) in lastCharacterState.needs" :key="key" class="need-item">
                  <span class="need-label">{{ key }}</span>
                  <div class="need-bar-bg">
                    <div class="need-bar-fill" :style="{
                      width: `${Math.min(100, (typeof val === 'number' ? (val > 1 ? val/10 : val*100) : 50))}%`,
                      background: (typeof val === 'number' ? (val > 1 ? val/10 : val*100) : 50) > 50 ? '#22c55e' : '#f59e0b'
                    }" />
                  </div>
                </div>
              </div>
            </div>

            <button class="action-btn refresh-btn" @click="store.fetchCharacterState()">🔄 刷新状态</button>
          </template>
          <div v-else class="empty-state">
            <button class="fetch-btn" @click="store.fetchCharacterState()">获取角色状态</button>
          </div>
        </div>

        <!-- 🎭 角色配置编辑器 -->
        <div v-if="activeTab === 'character'" class="settings-panel">
          <template v-if="editConfig">
            <div class="config-section">
              <h4 class="config-title">📛 基本信息</h4>
              <label class="setting-item">
                <span>名称</span>
                <input v-model="editConfig.name" type="text" class="setting-input">
              </label>
              <label class="setting-item">
                <span>MBTI</span>
                <select v-model="editConfig.personality.mbti" class="setting-input">
                  <option v-for="t in ['ENTJ','INTJ','ENTP','INTP','ENFJ','INFJ','ENFP','INFP','ESTJ','ISTJ','ESTP','ISTP','ESFJ','ISFJ','ESFP','ISFP']" :key="t">{{ t }}</option>
                </select>
              </label>
              <label class="setting-item">
                <span>星座</span>
                <select v-model="editConfig.personality.zodiac" class="setting-input">
                  <option v-for="z in ['水瓶座','双鱼座','白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座','摩羯座']" :key="z">{{ z }}</option>
                </select>
              </label>
            </div>
            <div v-if="editConfig.personality?.big_five" class="config-section">
              <h4 class="config-title">🧬 大五人格</h4>
              <div v-for="(label, key) in { openness: '开放性', conscientiousness: '尽责性', extraversion: '外向性', agreeableness: '宜人性', neuroticism: '神经质' }" :key="key" class="slider-row">
                <span class="slider-label">{{ label }}</span>
                <input type="range" min="0" max="100" :value="Math.round((editConfig.personality.big_five[key] || 0) * 100)" class="slider" @input="(e: Event) => editConfig!.personality.big_five[key] = Number((e.target as HTMLInputElement).value) / 100">
                <span class="slider-value">{{ Math.round((editConfig.personality.big_five[key] || 0) * 100) }}</span>
              </div>
            </div>
            <div v-if="editConfig.four_layers" class="config-section">
              <h4 class="config-title">💎 四层心理</h4>
              <div v-for="(label, key) in { core: '核心价值观', self: '身份认同', motivation: '当前动机', state: '情绪状态' }" :key="key" class="textarea-row">
                <span class="textarea-label">{{ label }}</span>
                <textarea v-model="editConfig.four_layers[key]" rows="2" class="setting-input config-textarea" />
              </div>
            </div>
            <div v-if="editConfig.speech_patterns" class="config-section">
              <h4 class="config-title">🚫 禁忌行为</h4>
              <div v-for="(item, idx) in (editConfig.speech_patterns.forbidden || [])" :key="idx" class="forbidden-row">
                <input v-model="editConfig.speech_patterns.forbidden[idx]" type="text" class="setting-input forbidden-input">
                <button class="remove-btn" @click="removeForbidden(idx)">×</button>
              </div>
              <button class="action-btn add-btn" @click="addForbidden">+ 添加</button>
            </div>
            <div class="setting-actions">
              <button class="action-btn save-btn" :disabled="configSaving" @click="saveConfig">💾 保存</button>
              <button class="action-btn" @click="resetConfig">↩️ 重置</button>
              <span v-if="configStatus" class="config-status">{{ configStatus }}</span>
            </div>
          </template>
          <div v-else class="empty-state">
            <button class="fetch-btn" @click="loadConfig">加载角色配置</button>
          </div>
        </div>

        <!-- ⚙️ 设置 -->
        <div v-if="activeTab === 'settings'" class="settings-panel">
          <label class="setting-item">
            <span>启用桥接</span>
            <input v-model="enabled" type="checkbox">
          </label>
          <label class="setting-item">
            <span>NarrativeEngine 地址</span>
            <input v-model="store.bridgeUrl" type="text" class="setting-input" placeholder="http://localhost:5555">
          </label>
          <label class="setting-item">
            <span>角色 ID</span>
            <input v-model="store.characterId" type="text" class="setting-input" placeholder="saihisis">
          </label>
          <div class="setting-actions">
            <button class="action-btn" @click="store.connectWebSocket()">重新连接</button>
            <button class="action-btn danger" @click="store.clearEvents()">清空事件</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cognitive-bubble {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 480px;
  max-height: 720px;
  background: rgba(15, 15, 25, 0.92);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 60px rgba(139, 92, 246, 0.08);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: #e2e8f0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cognitive-bubble.dragging { transition: none; opacity: 0.95; cursor: grabbing; }
.cognitive-bubble.collapsed { max-height: 44px; width: 260px; }

.bubble-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; cursor: grab;
  background: rgba(139, 92, 246, 0.1);
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
  user-select: none;
}
.bubble-header:active { cursor: grabbing; }
.header-left { display: flex; align-items: center; gap: 8px; }
.pulse-dot { width: 8px; height: 8px; border-radius: 50%; animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.header-title { font-weight: 600; font-size: 13px; }
.header-status { font-size: 11px; color: #94a3b8; }
.header-right { display: flex; align-items: center; gap: 8px; }
.consciousness-badge {
  font-size: 10px; padding: 2px 8px;
  background: rgba(234, 179, 8, 0.2); color: #eab308;
  border-radius: 10px; border: 1px solid rgba(234, 179, 8, 0.3);
  animation: glow 2s ease-in-out infinite;
}
@keyframes glow { 0%, 100% { box-shadow: 0 0 4px rgba(234, 179, 8, 0.2); } 50% { box-shadow: 0 0 12px rgba(234, 179, 8, 0.4); } }
.collapse-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 0; }
.bubble-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.tab-bar { display: flex; gap: 2px; padding: 6px 8px; background: rgba(0, 0, 0, 0.2); }
.tab-btn {
  flex: 1; padding: 6px 4px; font-size: 11px;
  background: transparent; border: none; color: #94a3b8;
  border-radius: 6px; cursor: pointer; transition: all 0.2s;
}
.tab-btn.active { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; }
.tab-btn:hover:not(.active) { background: rgba(255, 255, 255, 0.05); }

/* ━━━━━━━━━ 实时流 ━━━━━━━━━ */
.event-stream {
  flex: 1; overflow-y: auto; padding: 8px; max-height: 380px;
  scrollbar-width: thin; scrollbar-color: rgba(139, 92, 246, 0.3) transparent;
}

.event-item {
  display: flex; gap: 8px; padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  animation: slideIn 0.3s ease-out;
  position: relative;
}

/* 🆕 因果连线 */
.event-item.causal-chain::after {
  content: '';
  position: absolute;
  left: 13px;
  bottom: -1px;
  width: 2px;
  height: calc(100% - 20px);
  background: linear-gradient(to bottom, rgba(139, 92, 246, 0.4), rgba(139, 92, 246, 0.1));
  top: 24px;
  z-index: 1;
}

/* 🆕 Task 4: 记忆涟漪动画 */
.event-item.memory-ripple { animation: slideIn 0.3s ease-out, memoryRipple 0.8s ease-out; }
@keyframes memoryRipple {
  0% { box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(217, 70, 239, 0); }
  100% { box-shadow: 0 0 0 0 rgba(217, 70, 239, 0); }
}

/* 🆕 主动发言高亮 */
.event-item.proactive-event {
  background: rgba(234, 179, 8, 0.06);
  border-left: 2px solid rgba(234, 179, 8, 0.5);
  padding-left: 8px;
}

@keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.event-layer {
  flex-shrink: 0; width: 28px; height: 20px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: white; margin-top: 2px;
}
.event-body { flex: 1; min-width: 0; }
.event-meta { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.event-icon { font-size: 12px; }
.event-layer-name { font-size: 11px; color: #94a3b8; font-weight: 500; }
.event-time { font-size: 10px; color: #64748b; margin-left: auto; }
.event-content { font-size: 12px; color: #cbd5e1; line-height: 1.4; word-break: break-all; }

/* 🆕 Task 3: 记忆溯源展开 */
.memory-expand-trigger {
  font-size: 10px; color: #a78bfa; cursor: pointer; margin-top: 4px;
  display: flex; align-items: center; gap: 6px;
  transition: color 0.2s;
}
.memory-expand-trigger:hover { color: #c4b5fd; }
.search-method-badge {
  font-size: 9px; padding: 1px 5px;
  background: rgba(139, 92, 246, 0.15); border-radius: 4px;
}
.memory-expand-panel {
  margin-top: 4px; padding: 6px 8px;
  background: rgba(139, 92, 246, 0.06);
  border-radius: 6px; border-left: 2px solid rgba(139, 92, 246, 0.3);
  animation: expandIn 0.2s ease-out;
}
@keyframes expandIn { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 300px; } }
.memory-trace-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0; font-size: 10px; color: #94a3b8;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.memory-trace-item:last-child { border-bottom: none; }
.mem-layer-tag {
  font-size: 9px; padding: 1px 4px; border-radius: 3px;
  background: rgba(217, 70, 239, 0.2); color: #d946ef;
  font-weight: 600; flex-shrink: 0;
}
.mem-content { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mem-score { color: #22c55e; font-weight: 600; flex-shrink: 0; }
.mem-time { color: #64748b; flex-shrink: 0; }

/* ━━━━━━━━━ 🆕 身份卡面板 ━━━━━━━━━ */
.identity-panel { overflow-y: auto; padding: 12px; max-height: 600px; }

.identity-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 14px; padding-bottom: 12px;
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
}
.identity-avatar {
  width: 44px; height: 44px; border-radius: 12px;
  background: linear-gradient(135deg, #8b5cf6, #a855f7);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: white;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}
.identity-info { flex: 1; }
.identity-name { margin: 0; font-size: 16px; font-weight: 700; color: #e2e8f0; }
.identity-tags { display: flex; gap: 6px; margin-top: 4px; }
.id-tag {
  font-size: 10px; padding: 2px 8px; border-radius: 6px;
  font-weight: 600;
}
.id-tag.mbti { background: rgba(139, 92, 246, 0.2); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }
.id-tag.zodiac { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }

.section-title {
  font-size: 11px; font-weight: 600; color: #a78bfa;
  margin: 0 0 8px 0;
}

/* 🆕 雷达图 */
.radar-section { margin-bottom: 14px; }
.radar-container { position: relative; width: 100%; display: flex; justify-content: center; }
.radar-chart { width: 140px; height: 140px; }
.radar-labels {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 200px; height: 140px;
}
.radar-label {
  position: absolute; font-size: 9px; color: #94a3b8; white-space: nowrap;
}
.radar-val { color: #a78bfa; font-weight: 600; margin-left: 2px; }
.radar-label.pos-0 { top: -2px; left: 50%; transform: translateX(-50%); }
.radar-label.pos-1 { top: 40%; right: -10px; }
.radar-label.pos-2 { bottom: 5px; right: 10px; }
.radar-label.pos-3 { bottom: 5px; left: 10px; }
.radar-label.pos-4 { top: 40%; left: -10px; }

/* 🆕 四层心理卡片 */
.layers-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;
}
.layer-card {
  padding: 10px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.06);
}
.layer-card.core { background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(139,92,246,0.02)); }
.layer-card.self { background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(6,182,212,0.02)); }
.layer-card.motivation { background: linear-gradient(135deg, rgba(249,115,22,0.08), rgba(249,115,22,0.02)); }
.layer-card.emotion { background: linear-gradient(135deg, rgba(236,72,153,0.08), rgba(236,72,153,0.02)); }
.layer-icon { font-size: 14px; }
.layer-label { font-size: 10px; color: #64748b; margin-left: 4px; }
.layer-value { margin: 4px 0 0; font-size: 11px; color: #cbd5e1; line-height: 1.4; }

/* 目标 */
.goals-section { margin-bottom: 14px; }
.goal-item { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 11px; }
.goal-priority {
  font-size: 10px; padding: 1px 5px;
  background: rgba(244, 63, 94, 0.2); color: #f43f5e;
  border-radius: 4px; font-weight: 600;
}
.goal-desc { flex: 1; color: #cbd5e1; }
.goal-progress { width: 50px; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; flex-shrink: 0; }
.goal-bar { height: 100%; background: linear-gradient(90deg, #8b5cf6, #c084fc); border-radius: 2px; transition: width 0.5s ease; }

/* 需求仪表盘 */
.needs-section { margin-bottom: 14px; }
.needs-grid { display: flex; flex-direction: column; gap: 4px; }
.need-item { display: flex; align-items: center; gap: 8px; }
.need-label { font-size: 10px; color: #94a3b8; width: 50px; flex-shrink: 0; }
.need-bar-bg { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.need-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }

.refresh-btn { margin-top: 8px; width: 100%; }

/* ━━━━━━━━━ 设置面板 (保留) ━━━━━━━━━ */
.settings-panel { padding: 12px; overflow-y: auto; max-height: 600px; }
.setting-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px;
}
.setting-input {
  width: 180px; padding: 4px 8px;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px; color: #e2e8f0; font-size: 11px;
}
.setting-actions { display: flex; gap: 8px; margin-top: 12px; }
.action-btn {
  flex: 1; padding: 6px; font-size: 11px;
  background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.3);
  color: #c4b5fd; border-radius: 6px; cursor: pointer; transition: all 0.2s;
}
.action-btn:hover { background: rgba(139, 92, 246, 0.3); }
.action-btn.danger { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); color: #f87171; }
.action-btn.danger:hover { background: rgba(239, 68, 68, 0.25); }
.empty-state { display: flex; align-items: center; justify-content: center; padding: 40px; color: #64748b; font-size: 12px; }
.fetch-btn {
  padding: 8px 16px; background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.3); color: #c4b5fd;
  border-radius: 8px; cursor: pointer; font-size: 12px;
}
.fetch-btn:hover { background: rgba(139, 92, 246, 0.3); }

/* 角色配置编辑器 */
.config-section { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.config-title { font-size: 11px; color: #a78bfa; margin: 0 0 8px 0; font-weight: 600; }
.slider-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.slider-label { width: 50px; font-size: 11px; color: #94a3b8; flex-shrink: 0; }
.slider {
  flex: 1; height: 4px; -webkit-appearance: none;
  background: rgba(139, 92, 246, 0.2); border-radius: 2px; outline: none;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: #8b5cf6; cursor: pointer;
  border: 2px solid rgba(15, 15, 25, 0.8);
  box-shadow: 0 0 6px rgba(139, 92, 246, 0.4);
}
.slider-value { width: 28px; text-align: right; font-size: 11px; color: #a78bfa; font-weight: 600; flex-shrink: 0; }
.textarea-row { margin-bottom: 6px; }
.textarea-label { display: block; font-size: 10px; color: #94a3b8; margin-bottom: 2px; }
.config-textarea { width: 100% !important; resize: vertical; min-height: 36px; font-size: 11px; line-height: 1.4; box-sizing: border-box; }
.forbidden-row { display: flex; gap: 4px; margin-bottom: 4px; }
.forbidden-input { flex: 1 !important; width: auto !important; }
.remove-btn {
  padding: 2px 8px; background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171;
  border-radius: 4px; cursor: pointer; font-size: 14px; line-height: 1;
}
.add-btn { flex: none !important; padding: 3px 10px !important; font-size: 10px !important; }
.save-btn { background: rgba(34, 197, 94, 0.2) !important; border-color: rgba(34, 197, 94, 0.3) !important; color: #4ade80 !important; }
.save-btn:hover { background: rgba(34, 197, 94, 0.3) !important; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.config-status { font-size: 11px; display: flex; align-items: center; color: #94a3b8; }
</style>
