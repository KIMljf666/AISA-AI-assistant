<template>
  <div
    flex="~ col"
    border="solid 4 primary-200/20 dark:primary-400/20"
    h-full w-full rounded-xl
    bg="primary-50/50 dark:primary-950/70" backdrop-blur-md
    class="chat-container-resizable"
  >
    <slot />
  </div>
</template>

<style scoped>
.chat-container-resizable {
  resize: horizontal;
  overflow: auto;
  min-width: 260px;
}
/* 🆕 Sprint 7: 调整大小手柄样式 */
.chat-container-resizable::-webkit-resizer {
  background: linear-gradient(135deg, transparent 60%, rgba(99, 102, 241, 0.3) 60%, rgba(99, 102, 241, 0.3) 75%, transparent 75%);
  border-radius: 0 0 12px 0;
  cursor: ew-resize;
}
</style>
