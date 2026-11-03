<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ text: string; label?: string }>();
const state = ref<'idle' | 'copied' | 'failed'>('idle');

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
    state.value = 'copied';
  } catch {
    state.value = 'failed';
  }
  window.setTimeout(() => {
    state.value = 'idle';
  }, 2000);
}
</script>

<template>
  <button type="button" class="secondary" @click="copy">
    {{ state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : (label ?? 'Copy') }}
  </button>
</template>
