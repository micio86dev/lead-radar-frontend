<script setup lang="ts">
import { ref, useId } from 'vue';

const props = defineProps<{
  label: string;
  confirmation: string;
  danger?: boolean;
}>();

const confirmed = ref(false);
/**
 * The checkbox must carry `name="confirm"`: the server refuses the billable run and the data-removal
 * request without that field, so a nameless checkbox produced a form that always answered
 * "confirmation required". The id is unique per instance because a page can render several of these
 * (one per registered Actor).
 */
const checkboxId = useId();
</script>

<template>
  <div>
    <div class="checkbox-row">
      <input :id="checkboxId" v-model="confirmed" type="checkbox" name="confirm" />
      <label :for="checkboxId">{{ confirmation }}</label>
    </div>
    <p>
      <button type="submit" :class="{ danger: props.danger }" :disabled="!confirmed">
        {{ label }}
      </button>
    </p>
  </div>
</template>
