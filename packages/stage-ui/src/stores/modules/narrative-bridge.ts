/**
 * NarrativeEngine 桥接 Store
 *
 * 负责与 NarrativeEngine 的自驱系统通信：
 * 1. 获取角色心理/记忆/情绪状态 → 注入 system prompt
 * 2. 对话后反馈 → 触发记忆存储和 RGES 反思
 * 3. 认知事件 WebSocket → 实时推送意识流和认知过程
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

export interface CognitiveEvent {
  layer: number
  layer_name: string
  content: string
  timestamp: string
  event_type: 'thinking' | 'memory_recall' | 'emotion' | 'goal' | 'reflection' | 'decision' | 'llm_reasoning' | 'proactive_dialogue'
  metadata?: Record<string, any>
}

export interface CharacterState {
  character_id: string
  name: string
  personality: {
    mbti: string
    big_five?: Record<string, number>
    zodiac?: string
  }
  four_layers: {
    core: string
    self: string
    motivation: string
    state: string
  }
  recent_memory: Array<{ content: string, timestamp: string, type: string }>
  goals: Array<{ description: string, priority: number, progress: number }>
  consciousness_stream: string | null
  rges_insights: Array<{ insight: string, type: string }>
  needs: Record<string, number> | null
  timestamp: string
}

export const LAYER_COLORS: Record<number, string> = {
  0: '#6366f1', // 感知层 - indigo
  1: '#8b5cf6', // 注意力层 - violet
  2: '#a855f7', // 解读层 - purple
  3: '#d946ef', // 记忆层 - fuchsia
  4: '#ec4899', // 需求层 - pink
  5: '#f43f5e', // 目标层 - rose
  6: '#f97316', // 方案层 - orange
  7: '#eab308', // 意识流 - yellow
  8: '#22c55e', // 决策层 - green
  9: '#06b6d4', // 反思层 - cyan
}

export const LAYER_ICONS: Record<string, string> = {
  thinking: '💭',
  memory_recall: '🧠',
  emotion: '💗',
  goal: '🎯',
  reflection: '🔄',
  decision: '⚡',
  llm_reasoning: '🤔',
}

export const useNarrativeBridgeStore = defineStore('narrative-bridge', () => {
  // Configuration
  const bridgeUrl = ref('http://localhost:5555')
  const characterId = ref('saihisis')
  const enabled = ref(true)
  const showCognitiveBubble = ref(true)

  // State
  const connected = ref(false)
  const lastCharacterState = shallowRef<CharacterState | null>(null)
  const cognitiveEvents = ref<CognitiveEvent[]>([])
  const maxEvents = ref(100)
  const enrichedSystemPrompt = ref('')
  const ws = shallowRef<WebSocket | null>(null)
  const wsReconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  // 🆕 Phase 9: 主动对话支持
  const proactiveMessage = ref<string | null>(null)
  const onProactiveDialogue = ref<((content: string) => void) | null>(null)

  // 🆕 Phase 19: 陪伴感 — 共处感知
  const sessionStartTime = ref(Date.now())
  const sessionDurationMinutes = ref(0)
  const isUserAway = ref(false)
  const userAwayStartTime = ref(0)
  const lastUserActivityTime = ref(Date.now())
  const idleStatusText = ref('在想事情...')
  const companionStatsText = ref('')

  // 闲置状态文本 (基于时段+心理状态)
  const IDLE_TEXTS_BY_PERIOD: Record<string, string[]> = {
    morning: ['在想今天的计划...', '早上空气真好呢', '新的一天开始了！'],
    afternoon: ['在思考一些有趣的事情...', '下午了，要不要休息一下？', '有点想聊天呢...'],
    evening: ['傍晚了呢...', '今天过得怎么样？', '在回顾今天的事情...'],
    night: ['夜深了...', '还在忙吗？', '有点困了...'],
  }

  function getTimePeriod(): string {
    const h = new Date().getHours()
    if (h >= 6 && h < 12)
      return 'morning'
    if (h >= 12 && h < 18)
      return 'afternoon'
    if (h >= 18 && h < 22)
      return 'evening'
    return 'night'
  }

  function updateIdleStatus() {
    const period = getTimePeriod()
    const texts = IDLE_TEXTS_BY_PERIOD[period] || IDLE_TEXTS_BY_PERIOD.afternoon
    idleStatusText.value = texts[Math.floor(Math.random() * texts.length)]
  }

  function updateSessionDuration() {
    sessionDurationMinutes.value = Math.floor((Date.now() - sessionStartTime.value) / 60000)
    const mins = sessionDurationMinutes.value
    if (mins < 1)
      companionStatsText.value = '刚刚上线'
    else if (mins < 60)
      companionStatsText.value = `一起待了 ${mins} 分钟`
    else companionStatsText.value = `一起待了 ${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`
  }

  // Page Visibility 监听
  function setupPageVisibility() {
    if (typeof document === 'undefined')
      return
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 用户离开
        isUserAway.value = true
        userAwayStartTime.value = Date.now()
        addLocalEvent({
          layer: 7,
          layer_name: '意识流',
          content: '用户切换了窗口...去忙了吧',
          timestamp: new Date().toISOString(),
          event_type: 'thinking',
        })
      }
      else {
        // 用户回来
        const awayMs = Date.now() - userAwayStartTime.value
        const awayMin = Math.floor(awayMs / 60000)
        isUserAway.value = false
        lastUserActivityTime.value = Date.now()

        let welcomeBack = '欢迎回来！'
        if (awayMin >= 60)
          welcomeBack = `欢迎回来！你离开了 ${Math.floor(awayMin / 60)} 小时 ${awayMin % 60} 分钟`
        else if (awayMin >= 5)
          welcomeBack = `欢迎回来！你离开了 ${awayMin} 分钟`
        else if (awayMin >= 1)
          welcomeBack = `回来啦～`

        if (awayMin >= 1) {
          addLocalEvent({
            layer: 7,
            layer_name: '意识流',
            content: welcomeBack,
            timestamp: new Date().toISOString(),
            event_type: 'thinking',
            metadata: { away_minutes: awayMin, trigger: 'page_visibility' },
          })

          // 如果离开超过 5 分钟且有回调注册，触发主动问候
          if (awayMin >= 5 && onProactiveDialogue.value) {
            onProactiveDialogue.value(welcomeBack)
          }
        }
      }
    })
  }

  // 定时器：每 30 秒更新闲置状态 + 每 60 秒更新在线时长
  let idleTimer: ReturnType<typeof setInterval> | null = null
  let durationTimer: ReturnType<typeof setInterval> | null = null

  function startCompanionTimers() {
    updateIdleStatus()
    updateSessionDuration()
    setupPageVisibility()
    idleTimer = setInterval(updateIdleStatus, 30000)
    durationTimer = setInterval(updateSessionDuration, 60000)
  }

  function stopCompanionTimers() {
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null }
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null }
  }

  // Computed
  const latestEvent = computed(() =>
    cognitiveEvents.value.length > 0
      ? cognitiveEvents.value[cognitiveEvents.value.length - 1]
      : null,
  )

  const eventsByLayer = computed(() => {
    const grouped: Record<number, CognitiveEvent[]> = {}
    for (const event of cognitiveEvents.value) {
      if (!grouped[event.layer])
        grouped[event.layer] = []
      grouped[event.layer].push(event)
    }
    return grouped
  })

  const isConsciousnessActive = computed(() =>
    cognitiveEvents.value.some(e =>
      e.event_type === 'thinking'
      && Date.now() - new Date(e.timestamp).getTime() < 60000,
    ),
  )

  // Actions
  async function fetchCharacterState(): Promise<CharacterState | null> {
    if (!enabled.value)
      return null

    try {
      const resp = await fetch(`${bridgeUrl.value}/api/airi/character-state/${characterId.value}`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const state = await resp.json() as CharacterState
      lastCharacterState.value = state

      addLocalEvent({
        layer: 0,
        layer_name: '感知层',
        content: `角色状态已获取: ${state.name}`,
        timestamp: new Date().toISOString(),
        event_type: 'thinking',
      })

      return state
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch character state:', err)
      return null
    }
  }

  async function fetchEnrichedPrompt(): Promise<string> {
    if (!enabled.value)
      return ''

    try {
      const resp = await fetch(`${bridgeUrl.value}/api/airi/character-state/${characterId.value}/system-prompt`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      enrichedSystemPrompt.value = data.system_prompt
      return data.system_prompt
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch enriched prompt:', err)
      return ''
    }
  }

  async function submitDialogueFeedback(
    userMessage: string,
    assistantResponse: string,
    reasoningContent?: string,
    modelUsed?: string,
  ) {
    if (!enabled.value)
      return

    try {
      const body: Record<string, any> = {
        character_id: characterId.value,
        user_message: userMessage,
        assistant_response: assistantResponse,
        timestamp: new Date().toISOString(),
      }
      // 🆕 P1: 传递 reasoning_content 和 model
      if (reasoningContent)
        body.reasoning_content = reasoningContent
      if (modelUsed)
        body.model_used = modelUsed

      await fetch(`${bridgeUrl.value}/api/airi/dialogue-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      addLocalEvent({
        layer: 9,
        layer_name: '反思层',
        content: `对话反馈已提交: "${userMessage.slice(0, 30)}..."`,
        timestamp: new Date().toISOString(),
        event_type: 'reflection',
      })
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to submit dialogue feedback:', err)
    }
  }

  function addLocalEvent(event: CognitiveEvent) {
    cognitiveEvents.value.push(event)
    if (cognitiveEvents.value.length > maxEvents.value)
      cognitiveEvents.value = cognitiveEvents.value.slice(-maxEvents.value)
  }

  // WebSocket for real-time cognitive events
  function connectWebSocket() {
    if (ws.value?.readyState === WebSocket.OPEN)
      return

    const wsUrl = bridgeUrl.value.replace('http', 'ws')
    const socket = new WebSocket(`${wsUrl}/api/airi/ws/cognitive-stream`)

    socket.onopen = () => {
      connected.value = true
      console.log('[NarrativeBridge] 🔗 Cognitive stream connected')
      addLocalEvent({
        layer: 0,
        layer_name: '系统',
        content: '认知仿真流已连接',
        timestamp: new Date().toISOString(),
        event_type: 'thinking',
      })
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CognitiveEvent | { type: string }
        if ('layer' in data) {
          const ce = data as CognitiveEvent
          addLocalEvent(ce)

          // 🆕 Phase 9: 检测主动对话事件
          if (ce.event_type === 'proactive_dialogue' && ce.content) {
            proactiveMessage.value = ce.content
            if (onProactiveDialogue.value) {
              onProactiveDialogue.value(ce.content)
            }
          }
        }
      }
      catch {
        // ignore parse errors
      }
    }

    socket.onclose = () => {
      connected.value = false
      console.log('[NarrativeBridge] 🔌 Cognitive stream disconnected')

      // Auto-reconnect after 5s
      if (enabled.value) {
        wsReconnectTimer.value = setTimeout(() => {
          connectWebSocket()
        }, 5000)
      }
    }

    socket.onerror = (err) => {
      console.warn('[NarrativeBridge] WebSocket error:', err)
    }

    ws.value = socket
  }

  function disconnectWebSocket() {
    if (wsReconnectTimer.value) {
      clearTimeout(wsReconnectTimer.value)
      wsReconnectTimer.value = null
    }
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    connected.value = false
  }

  function clearEvents() {
    cognitiveEvents.value = []
  }

  // 🆕 Phase 5f: Character Config CRUD
  const characterConfig = ref<Record<string, any> | null>(null)
  const configSaving = ref(false)

  async function fetchCharacterConfig(): Promise<Record<string, any> | null> {
    if (!enabled.value)
      return null
    try {
      const resp = await fetch(`${bridgeUrl.value}/api/airi/character-config/${characterId.value}`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      characterConfig.value = data.config
      return data.config
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch character config:', err)
      return null
    }
  }

  async function saveCharacterConfig(updates: Record<string, any>): Promise<boolean> {
    if (!enabled.value)
      return false
    configSaving.value = true
    try {
      const resp = await fetch(`${bridgeUrl.value}/api/airi/character-config/${characterId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      characterConfig.value = data.config

      addLocalEvent({
        layer: 1,
        layer_name: '人格层',
        content: `角色配置已保存: ${data.updated_fields?.join(', ')}`,
        timestamp: new Date().toISOString(),
        event_type: 'thinking',
      })
      return true
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to save character config:', err)
      return false
    }
    finally {
      configSaving.value = false
    }
  }

  // 🆕 Dashboard: state refs
  const promptInspect = ref<Record<string, any> | null>(null)
  const memoryBrowser = ref<{ total: number, stats: Record<string, any>, entries: any[] } | null>(null)
  const conversationHistory = ref<{ total: number, entries: any[] } | null>(null)
  const dashboardMetrics = ref<Record<string, any> | null>(null)
  const dashboardLogs = ref<any[]>([])

  // 🆕 Dashboard: API methods
  async function fetchPromptInspect(): Promise<Record<string, any> | null> {
    try {
      const resp = await fetch(`${bridgeUrl.value}/api/airi/prompt-inspect`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      promptInspect.value = data
      return data
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch prompt inspect:', err)
      return null
    }
  }

  async function fetchMemoryBrowser(search = '', sort = 'newest', limit = 50): Promise<any> {
    try {
      const params = new URLSearchParams({ char_id: characterId.value, search, sort, limit: String(limit) })
      const resp = await fetch(`${bridgeUrl.value}/api/airi/memory-browser?${params}`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      memoryBrowser.value = data
      return data
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch memories:', err)
      return null
    }
  }

  async function fetchConversationHistory(limit = 50): Promise<any> {
    try {
      const params = new URLSearchParams({ char_id: characterId.value, limit: String(limit) })
      const resp = await fetch(`${bridgeUrl.value}/api/airi/conversation-history?${params}`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      conversationHistory.value = data
      return data
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch conversation history:', err)
      return null
    }
  }

  async function fetchMetrics(): Promise<any> {
    try {
      const resp = await fetch(`${bridgeUrl.value}/api/airi/metrics`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      dashboardMetrics.value = data
      return data
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch metrics:', err)
      return null
    }
  }

  async function fetchLogs(level = 'all', limit = 100): Promise<any> {
    try {
      const params = new URLSearchParams({ level, limit: String(limit) })
      const resp = await fetch(`${bridgeUrl.value}/api/airi/logs?${params}`)
      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      dashboardLogs.value = data.entries || []
      return data
    }
    catch (err) {
      console.warn('[NarrativeBridge] Failed to fetch logs:', err)
      return null
    }
  }

  // Auto-connect when enabled + start companion timers
  watch(enabled, (newVal) => {
    if (newVal) {
      connectWebSocket()
      startCompanionTimers()
    }
    else {
      disconnectWebSocket()
      stopCompanionTimers()
    }
  })

  return {
    // Config
    bridgeUrl,
    characterId,
    enabled,
    showCognitiveBubble,

    // State
    connected,
    lastCharacterState,
    cognitiveEvents,
    enrichedSystemPrompt,
    characterConfig,
    configSaving,

    // 🆕 Dashboard state
    promptInspect,
    memoryBrowser,
    conversationHistory,
    dashboardMetrics,
    dashboardLogs,

    // Computed
    latestEvent,
    eventsByLayer,
    isConsciousnessActive,

    // Actions
    fetchCharacterState,
    fetchEnrichedPrompt,
    submitDialogueFeedback,
    connectWebSocket,
    disconnectWebSocket,
    clearEvents,
    addLocalEvent,
    fetchCharacterConfig,
    saveCharacterConfig,
    // 🆕 Dashboard actions
    fetchPromptInspect,
    fetchMemoryBrowser,
    fetchConversationHistory,
    fetchMetrics,
    fetchLogs,
    // 🆕 Phase 9: Proactive dialogue
    proactiveMessage,
    onProactiveDialogue,

    // 🆕 Phase 19: Companion presence
    sessionDurationMinutes,
    idleStatusText,
    companionStatsText,
    isUserAway,
    lastUserActivityTime,
    startCompanionTimers,
    stopCompanionTimers,
  }
})
