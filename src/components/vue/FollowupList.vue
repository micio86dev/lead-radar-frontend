<script setup lang="ts">
import { ref } from 'vue';

interface Followup {
  lead_id: string;
  title: string | null;
  url: string | null;
  community: string | null;
  state: string;
  new_replies: number;
  last_reporter: string | null;
  last_excerpt: string | null;
  last_reply_at: string | null;
  published_at: string | null;
  updated_at: string;
}

const props = defineProps<{ items: Followup[] }>();

const rows = ref<Followup[]>([...props.items]);
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null);
const busy = ref<string | null>(null);

async function update(leadId: string, state: 'answered' | 'closed'): Promise<void> {
  busy.value = leadId;
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'followup.update', lead_id: leadId, state }),
    });
    const text = await response.text();
    if (!response.ok) {
      const parsed = text ? (JSON.parse(text) as { error?: { message?: string } }) : null;
      message.value = { kind: 'error', text: parsed?.error?.message ?? 'request failed' };
      return;
    }
    rows.value = rows.value.filter((row) => row.lead_id !== leadId);
    message.value = { kind: 'ok', text: `follow-up ${state}` };
  } catch (error) {
    message.value = { kind: 'error', text: String(error) };
  } finally {
    busy.value = null;
  }
}

function when(value: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
}
</script>

<template>
  <section aria-label="Follow-ups waiting for an answer">
    <p
      v-if="message"
      :class="['notice', message.kind === 'ok' ? 'notice--ok' : 'notice--error']"
      role="status"
    >
      {{ message.text }}
    </p>

    <p v-if="rows.length === 0" class="muted">
      Nothing waiting. Follow-ups open when you record a reply as posted; the browser widget reports
      new replies it sees on the thread.
    </p>

    <article v-for="row in rows" :key="row.lead_id" class="card followup">
      <div class="followup-head">
        <h2>
          <a v-if="row.url" :href="row.url" target="_blank" rel="noopener noreferrer">
            {{ row.title ?? '(no title)' }} <span aria-hidden="true">↗</span>
          </a>
          <template v-else>{{ row.title ?? '(no title)' }}</template>
        </h2>
        <span class="chip">{{ row.community ?? 'unknown community' }}</span>
      </div>

      <p class="muted small">
        replied {{ when(row.published_at) }} · last activity {{ when(row.updated_at) }}
      </p>

      <p v-if="row.new_replies > 0" class="replies">
        <strong>{{ row.new_replies }}</strong>
        new {{ row.new_replies === 1 ? 'reply' : 'replies' }}
        <template v-if="row.last_reporter">
          from <strong>{{ row.last_reporter }}</strong></template
        >
        <template v-if="row.last_reply_at"> · {{ when(row.last_reply_at) }}</template>
      </p>
      <p v-else class="muted small">No new replies seen yet by the widget.</p>

      <blockquote v-if="row.last_excerpt" class="excerpt">{{ row.last_excerpt }}</blockquote>

      <div class="actions">
        <a
          v-if="row.url"
          class="link-button"
          :href="row.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open thread <span aria-hidden="true">↗</span>
        </a>
        <a class="secondary-link" :href="`/opportunities/${row.lead_id}`">Lead details</a>
        <button
          type="button"
          :disabled="busy === row.lead_id"
          @click="update(row.lead_id, 'answered')"
        >
          Mark answered
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="busy === row.lead_id"
          @click="update(row.lead_id, 'closed')"
        >
          Close
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.followup-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: baseline;
  justify-content: space-between;
}

.followup-head h2 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.35;
}

.followup-head a {
  color: var(--color-ink);
  text-decoration: none;
}

.followup-head a:hover {
  text-decoration: underline;
}

.chip {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-line);
  background: var(--color-sunken);
  color: var(--color-ink-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.replies {
  margin: 0.5rem 0;
}

.excerpt {
  margin: 0.5rem 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--color-sunken);
  max-width: 68ch;
  white-space: pre-wrap;
}

.link-button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  font-weight: 600;
  font-size: 0.88rem;
  text-decoration: none;
  background: var(--color-raised);
}

.secondary-link {
  font-size: 0.88rem;
}
</style>
