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

    // Auto-connect when enabled
    watch(enabled, (newVal) => {
        if (newVal)
            connectWebSocket()
        else
            disconnectWebSocket()
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
        // 🆕 Phase 9: Proactive dialogue
        proactiveMessage,
        onProactiveDialogue,
    }
})
