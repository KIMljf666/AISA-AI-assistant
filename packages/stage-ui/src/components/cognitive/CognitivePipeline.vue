<script setup lang="ts">
/**
 * CognitivePipeline — 认知瀑布流展示组件 v1.0
 *
 * 将 9 层认知过程以时间线瀑布流形式展示，
 * 替代 Tab 切换，让外部观众一眼看到完整的思维链。
 *
 * 设计目标:
 * - 无需切 Tab，所有认知节点按时间线串联
 * - 用户消息穿插显示，形成完整因果链
 * - 对非技术观众友好 (中文标签 + 图标，无 L0-L9 编号)
 * - 支持 sidebar / fullscreen 两种布局模式
 */
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { LAYER_COLORS, useNarrativeBridgeStore } from '../../stores/modules/narrative-bridge'

const store = useNarrativeBridgeStore()
const { cognitiveEvents, connected, isConsciousnessActive } = storeToRefs(store)

// ── Props ──
const props = withDefaults(defineProps<{
  mode?: 'sidebar' | 'fullscreen'
}>(), { mode: 'sidebar' })

// ── State ──
const isOpen = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const detailLevel = ref<'simple' | 'detailed' | 'developer'>('simple')

// ── Layer 映射: 友好中文名 + 图标 ──
const LAYER_LABELS: Record<number, { name: string, icon: string }> = {
  0: { name: '感知', icon: '🌐' },
  1: { name: '注意', icon: '👁' },
  2: { name: '认知', icon: '🧩' },
  3: { name: '记忆', icon: '🧠' },
  4: { name: '需求', icon: '💗' },
  5: { name: '目标', icon: '🎯' },
  6: { name: 'Prompt', icon: '📝' },
  7: { name: '思考', icon: '💭' },
  8: { name: '执行', icon: '⚡' },
  9: { name: '反思', icon: '🔍' },
}

// 事件类型图标映射 (补充)
const EVENT_ICONS: Record<string, string> = {
  thinking: '💭',
  memory_recall: '🧠',
  emotion: '💗',
  goal: '🎯',
  reflection: '🔍',
  decision: '⚡',
  llm_reasoning: '🤔',
  proactive_dialogue: '💬',
}

// ── 瀑布流数据处理 ──
interface PipelineCard {
  id: string
  type: 'cognitive' | 'user_input' | 'airi_reply' | 'cycle_separator'
  layer?: number
  layerLabel?: string
  layerIcon?: string
  color?: string
  content: string
  timestamp: string
  eventType?: string
  metadata?: Record<string, any>
  isExpanded: boolean
  isNew: boolean
}

const cards = ref<PipelineCard[]>([])
const expandedCards = new Set<string>()
let cardIdCounter = 0

function getCardId(): string {
  return `card-${++cardIdCounter}`
}

function eventToCard(event: any): PipelineCard {
  const layer = event.layer ?? 7
  const label = LAYER_LABELS[layer] ?? { name: '未知', icon: '❓' }
  const eventIcon = EVENT_ICONS[event.event_type] ?? label.icon

  // 识别特殊事件类型
  let type: PipelineCard['type'] = 'cognitive'
  const content = event.content || ''

  // 检测用户输入 (通常在 L0 中包含用户消息)
  if (content.includes('用户消息:') || content.includes('用户输入:')) {
    type = 'user_input'
  }
  // 检测主动对话
  if (event.event_type === 'proactive_dialogue') {
    type = 'airi_reply'
  }

  return {
    id: getCardId(),
    type,
    layer,
    layerLabel: label.name,
    layerIcon: eventIcon,
    color: LAYER_COLORS[layer] ?? '#888',
    content,
    timestamp: formatTime(event.timestamp),
    eventType: event.event_type,
    metadata: event.metadata,
    isExpanded: false,
    isNew: true,
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }
  catch {
    return ts?.slice(11, 19) ?? '--:--:--'
  }
}

// 智能判断是否为意识流循环的起始 (新的 cycle)
function isCycleStart(event: any, prevEvent: any): boolean {
  if (!prevEvent) return false
  // 如果上一个事件和当前事件的 cycle 编号不同
  if (event.metadata?.cycle !== undefined && prevEvent?.metadata?.cycle !== undefined) {
    return event.metadata.cycle !== prevEvent.metadata.cycle
  }
  // 或者 layer 从高到低 (反思→感知 = 新循环)
  if (prevEvent.layer === 9 && event.layer === 0) return true
  return false
}

// 监听新事件
let prevRawEvent: any = null
watch(cognitiveEvents, (events) => {
  if (!events || events.length === 0) return
  const latest = events[events.length - 1]
  if (!latest) return

  // 检测新循环
  if (isCycleStart(latest, prevRawEvent) && cards.value.length > 0) {
    cards.value.push({
      id: getCardId(),
      type: 'cycle_separator',
      content: '── 意识流循环 ──',
      timestamp: formatTime(latest.timestamp),
      isExpanded: false,
      isNew: true,
    })
  }

  const card = eventToCard(latest)
  cards.value.push(card)

  // 限制卡片数量 (保留最新 200 张)
  if (cards.value.length > 200) {
    cards.value = cards.value.slice(-200)
  }

  // 清除旧卡片的 isNew
  setTimeout(() => {
    card.isNew = false
  }, 600)

  prevRawEvent = latest

  // 自动滚动
  if (autoScroll.value) {
    nextTick(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
      }
    })
  }
}, { deep: true })

function toggleCard(card: PipelineCard) {
  card.isExpanded = !card.isExpanded
  if (card.isExpanded) {
    expandedCards.add(card.id)
  }
  else {
    expandedCards.delete(card.id)
  }
}

function clearCards() {
  cards.value = []
}

function togglePanel() {
  isOpen.value = !isOpen.value
}

function cycleDetailLevel() {
  const levels: Array<typeof detailLevel.value> = ['simple', 'detailed', 'developer']
  const idx = levels.indexOf(detailLevel.value)
  detailLevel.value = levels[(idx + 1) % levels.length]
}

const detailLevelLabel = computed(() => {
  return { simple: '简洁', detailed: '详细', developer: '开发者' }[detailLevel.value]
})

// 按内容截断
function truncateContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content
  return `${content.slice(0, maxLen)}...`
}

// ── 状态指示 ──
const statusText = computed(() => {
  if (!connected.value) return '未连接'
  if (isConsciousnessActive.value) return '意识活跃'
  return '已连接'
})

const statusDot = computed(() => {
  if (!connected.value) return 'dot-offline'
  if (isConsciousnessActive.value) return 'dot-active'
  return 'dot-connected'
})
</script>

<template>
  <!-- 触发按钮 -->
  <button
    v-if="!isOpen"
    class="pipeline-toggle"
    @click="togglePanel"
  >
    <span class="toggle-icon">🧬</span>
    <span class="toggle-label">认知瀑布流</span>
    <span :class="['status-dot-sm', statusDot]" />
  </button>

  <!-- 瀑布流面板 -->
  <Teleport to="body">
    <Transition name="panel-slide">
      <div
        v-if="isOpen"
        :class="['pipeline-panel', `pipeline-${mode}`]"
      >
        <!-- 头部 -->
        <div class="pipeline-header">
          <div class="header-left">
            <span class="header-icon">🧬</span>
            <span class="header-title">认知瀑布流</span>
            <span :class="['status-dot', statusDot]" />
            <span class="status-text">{{ statusText }}</span>
          </div>
          <div class="header-actions">
            <button class="action-btn" :title="`当前: ${detailLevelLabel}`" @click="cycleDetailLevel">
              {{ detailLevelLabel }}
            </button>
            <button class="action-btn" title="清空" @click="clearCards">
              🗑️
            </button>
            <button class="action-btn close-btn" @click="togglePanel">
              ✕
            </button>
          </div>
        </div>

        <!-- 瀑布流内容 -->
        <div
          ref="scrollContainer"
          class="pipeline-scroll"
          @scroll="autoScroll = (scrollContainer!.scrollHeight - scrollContainer!.scrollTop - scrollContainer!.clientHeight) < 60"
        >
          <div v-if="cards.length === 0" class="empty-state">
            <span class="empty-icon">🧠</span>
            <p>等待认知事件...</p>
            <p class="empty-hint">开始对话或启动意识流循环</p>
          </div>

          <div class="timeline">
            <div
              v-for="card in cards"
              :key="card.id"
              :class="[
                'timeline-card',
                `card-${card.type}`,
                { 'card-new': card.isNew, 'card-expanded': card.isExpanded },
              ]"
              @click="card.type === 'cognitive' && toggleCard(card)"
            >
              <!-- 循环分隔线 -->
              <template v-if="card.type === 'cycle_separator'">
                <div class="separator">
                  <span class="separator-line" />
                  <span class="separator-text">{{ card.content }}</span>
                  <span class="separator-line" />
                </div>
              </template>

              <!-- 认知事件卡片 -->
              <template v-else-if="card.type === 'cognitive'">
                <div class="card-connector">
                  <div class="connector-line" />
                  <div class="connector-dot" :style="{ background: card.color }" />
                </div>
                <div class="card-body" :style="{ borderLeftColor: card.color }">
                  <div class="card-head">
                    <span class="card-icon">{{ card.layerIcon }}</span>
                    <span class="card-label" :style="{ color: card.color }">{{ card.layerLabel }}</span>
                    <span class="card-time">{{ card.timestamp }}</span>
                    <span v-if="card.type === 'cognitive'" class="expand-hint">{{ card.isExpanded ? '▼' : '▸' }}</span>
                  </div>
                  <div class="card-content">
                    {{ card.isExpanded ? card.content : truncateContent(card.content, detailLevel === 'simple' ? 60 : 200) }}
                  </div>
                  <!-- 开发者级别显示元数据 -->
                  <div v-if="detailLevel === 'developer' && card.metadata" class="card-metadata">
                    <span v-for="(v, k) in card.metadata" :key="String(k)" class="meta-tag">
                      {{ k }}: {{ v }}
                    </span>
                  </div>
                </div>
              </template>

              <!-- 用户输入卡片 -->
              <template v-else-if="card.type === 'user_input'">
                <div class="card-connector">
                  <div class="connector-line" />
                  <div class="connector-dot user-dot" />
                </div>
                <div class="card-body card-user">
                  <div class="card-head">
                    <span class="card-icon">👤</span>
                    <span class="card-label user-label">用户输入</span>
                    <span class="card-time">{{ card.timestamp }}</span>
                  </div>
                  <div class="card-content">{{ card.content }}</div>
                </div>
              </template>

              <!-- AIRI 回复卡片 -->
              <template v-else-if="card.type === 'airi_reply'">
                <div class="card-connector">
                  <div class="connector-line" />
                  <div class="connector-dot airi-dot" />
                </div>
                <div class="card-body card-airi">
                  <div class="card-head">
                    <span class="card-icon">✨</span>
                    <span class="card-label airi-label">AIRI 主动</span>
                    <span class="card-time">{{ card.timestamp }}</span>
                  </div>
                  <div class="card-content">{{ card.content }}</div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- 底部状态栏 -->
        <div class="pipeline-footer">
          <span class="footer-stat">{{ cards.length }} 事件</span>
          <label class="auto-scroll-toggle">
            <input v-model="autoScroll" type="checkbox">
            <span>自动滚动</span>
          </label>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 触发按钮 ── */
.pipeline-toggle {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 9998;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.92), rgba(20, 20, 40, 0.95));
  backdrop-filter: blur(12px);
  border: 1px solid rgba(100, 100, 255, 0.25);
  border-radius: 24px;
  color: #e0e0f0;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
.pipeline-toggle:hover {
  border-color: rgba(130, 130, 255, 0.5);
  box-shadow: 0 4px 24px rgba(99, 102, 241, 0.3);
  transform: translateY(-2px);
}
.toggle-icon { font-size: 18px; }
.toggle-label { font-weight: 500; }

/* ── 状态点 ── */
.status-dot-sm, .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot { width: 10px; height: 10px; margin-left: 4px; }
.dot-offline { background: #666; }
.dot-connected { background: #22c55e; }
.dot-active { background: #eab308; animation: pulse-dot 1.5s infinite; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
  50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(234, 179, 8, 0); }
}

/* ── 面板 ── */
.pipeline-panel {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(15, 15, 25, 0.96), rgba(10, 10, 20, 0.98));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(100, 100, 255, 0.15);
  color: #e0e0f0;
  font-family: 'Inter', -apple-system, sans-serif;
}
.pipeline-sidebar {
  left: 0;
  top: 0;
  bottom: 0;
  width: 420px;
  border-right: 1px solid rgba(100, 100, 255, 0.2);
  border-radius: 0;
}
.pipeline-fullscreen {
  inset: 0;
}

/* ── 过渡动画 ── */
.panel-slide-enter-active { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease; }
.panel-slide-leave-active { transition: transform 0.25s ease-in, opacity 0.2s ease; }
.panel-slide-enter-from { transform: translateX(-100%); opacity: 0; }
.panel-slide-leave-to { transform: translateX(-100%); opacity: 0; }

/* ── 头部 ── */
.pipeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(100, 100, 255, 0.12);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-icon { font-size: 20px; }
.header-title { font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
.status-text { font-size: 12px; color: #999; }

.header-actions {
  display: flex;
  gap: 6px;
}
.action-btn {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #eee;
}
.close-btn { font-size: 14px; padding: 4px 8px; }

/* ── 滚动区域 ── */
.pipeline-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}
.pipeline-scroll::-webkit-scrollbar { width: 4px; }
.pipeline-scroll::-webkit-scrollbar-track { background: transparent; }
.pipeline-scroll::-webkit-scrollbar-thumb { background: rgba(100, 100, 255, 0.3); border-radius: 2px; }

/* ── 空状态 ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #666;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.empty-state p { margin: 4px 0; }
.empty-hint { font-size: 12px; color: #555; }

/* ── 时间线 ── */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── 卡片 ── */
.timeline-card {
  display: flex;
  gap: 0;
  cursor: default;
  animation: none;
}
.timeline-card.card-cognitive { cursor: pointer; }
.timeline-card.card-new {
  animation: card-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── 连接线 ── */
.card-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
  padding-top: 14px;
}
.connector-line {
  width: 2px;
  flex: 1;
  background: rgba(100, 100, 255, 0.15);
  min-height: 20px;
}
.connector-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.3);
}
.user-dot { background: #60a5fa !important; box-shadow: 0 0 8px rgba(96, 165, 250, 0.4); }
.airi-dot { background: #f472b6 !important; box-shadow: 0 0 8px rgba(244, 114, 182, 0.4); }

/* ── 卡片主体 ── */
.card-body {
  flex: 1;
  padding: 10px 14px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid transparent;
  border-radius: 0 8px 8px 0;
  transition: all 0.2s ease;
}
.card-body:hover {
  background: rgba(255, 255, 255, 0.06);
}
.card-user {
  border-left-color: #60a5fa !important;
  background: rgba(96, 165, 250, 0.06);
}
.card-airi {
  border-left-color: #f472b6 !important;
  background: rgba(244, 114, 182, 0.06);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.card-icon { font-size: 15px; }
.card-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.user-label { color: #60a5fa !important; }
.airi-label { color: #f472b6 !important; }
.card-time { margin-left: auto; font-size: 11px; color: #666; font-family: 'JetBrains Mono', monospace; }
.expand-hint { font-size: 10px; color: #555; margin-left: 4px; }

.card-content {
  font-size: 13px;
  line-height: 1.5;
  color: #ccc;
  word-break: break-word;
  white-space: pre-wrap;
}

.card-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.meta-tag {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  font-size: 10px;
  color: #888;
  font-family: 'JetBrains Mono', monospace;
}

/* ── 分隔线 ── */
.separator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
.separator-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(234, 179, 8, 0.3), transparent);
}
.separator-text {
  font-size: 11px;
  color: #eab308;
  white-space: nowrap;
  letter-spacing: 1px;
}

/* ── 底部 ── */
.pipeline-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 18px;
  border-top: 1px solid rgba(100, 100, 255, 0.12);
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
}
.footer-stat { font-family: 'JetBrains Mono', monospace; }
.auto-scroll-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.auto-scroll-toggle input {
  width: 14px;
  height: 14px;
  accent-color: #6366f1;
}
</style>
