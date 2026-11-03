<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  label: string;
  confirmation: string;
  danger?: boolean;
}>();
const confirmed = ref(false);
</script>

<template>
  <div>
    <div class="checkbox-row">
      <input id="confirm-checkbox" v-model="confirmed" type="checkbox" />
      <label for="confirm-checkbox">{{ confirmation }}</label>
    </div>
    <p>
      <button type="submit" :class="{ danger: props.danger }" :disabled="!confirmed">
        {{ label }}
      </button>
    </p>
  </div>
</template>
