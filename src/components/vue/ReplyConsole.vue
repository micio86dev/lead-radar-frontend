<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

interface Lead {
  id: string;
  title: string | null;
  community: string | null;
  url: string | null;
  score: number | null;
  score_category: string | null;
  qualification_status: string;
  language: string | null;
  vertical_primary: string;
  content_snippet?: string;
  evidence_count?: number;
}

interface Draft {
  id: string;
  variant: string;
  status: string;
  language: string;
  body: string;
  version: number;
}

interface Item {
  lead: Lead;
  comments: Draft[];
}

const props = defineProps<{ items: Item[] }>();

const variants = ['helpful', 'soft_pitch', 'direct_pitch'] as const;
const variantLabels: Record<string, string> = {
  helpful: 'Helpful',
  soft_pitch: 'Soft pitch',
  direct_pitch: 'Direct pitch',
};

const index = ref(0);
const selected = ref<Record<string, string>>({});
const edited = ref<Record<string, string>>({});
const engagement = ref<Record<string, string>>({});
const done = ref<Record<string, boolean>>({});
const busy = ref(false);
const message = ref<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);

const item = computed<Item | undefined>(() => props.items[index.value]);
const draftsFor = (leadId: string): Draft[] =>
  item.value && item.value.lead.id === leadId ? item.value.comments : [];
const activeVariant = (leadId: string): string => selected.value[leadId] ?? 'helpful';
const draftFor = (leadId: string, variant: string): Draft | undefined =>
  draftsFor(leadId).find((draft) => draft.variant === variant);
const textFor = (leadId: string): string => {
  const variant = activeVariant(leadId);
  const draft = draftFor(leadId, variant);
  return edited.value[`${leadId}:${variant}`] ?? draft?.body ?? '';
};

function selectVariant(leadId: string, variant: string): void {
  selected.value = { ...selected.value, [leadId]: variant };
}

function setText(leadId: string, value: string): void {
  edited.value = { ...edited.value, [`${leadId}:${activeVariant(leadId)}`]: value };
}

function go(delta: number): void {
  const next = index.value + delta;
  if (next >= 0 && next < props.items.length) {
    index.value = next;
    message.value = null;
  }
}

async function action(
  op: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  busy.value = true;
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...payload }),
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const envelope = parsed as { error?: { code?: string; message?: string } } | null;
      message.value = {
        kind: 'error',
        text: `${envelope?.error?.code ?? 'error'}: ${envelope?.error?.message ?? 'request failed'}`,
      };
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    message.value = { kind: 'error', text: String(error) };
    return null;
  } finally {
    busy.value = false;
  }
}

async function copy(leadId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(textFor(leadId));
    message.value = { kind: 'ok', text: 'copied — paste it in the thread' };
  } catch {
    message.value = { kind: 'error', text: 'clipboard blocked: select the text manually' };
  }
}

function openThread(): void {
  const url = item.value?.lead.url;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else message.value = { kind: 'error', text: 'this lead has no original URL recorded' };
}

function setEngagement(leadId: string, value: string): void {
  engagement.value = { ...engagement.value, [leadId]: value };
}

async function generate(leadId: string): Promise<void> {
  const result = await action('reply.prepare', { limit: 1 });
  if (result) {
    message.value = {
      kind: 'info',
      text: `queued ${String(result.queued ?? 0)} generation job(s) for ${leadId.slice(0, 8)}… — the worker fills the drafts; reload in a few seconds`,
    };
  }
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  const current = item.value;
  if (!current) return;
  const leadId = current.lead.id;
  switch (event.key) {
    case 'j':
    case 'ArrowDown':
      go(1);
      break;
    case 'k':
    case 'ArrowUp':
      go(-1);
      break;
    case '1':
      selectVariant(leadId, 'helpful');
      break;
    case '2':
      selectVariant(leadId, 'soft_pitch');
      break;
    case '3':
      selectVariant(leadId, 'direct_pitch');
      break;
    case 'c':
      void copy(leadId);
      break;
    case 'o':
      openThread();
      break;
    case 'p':
      void posted(leadId);
      break;
    case 'g':
      void generate(leadId);
      break;
    default:
      return;
  }
  event.preventDefault();
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

async function posted(leadId: string): Promise<void> {
  const variant = activeVariant(leadId);
  const body = textFor(leadId).trim();
  if (!body) {
    message.value = { kind: 'error', text: 'nothing to record: generate or write the reply first' };
    return;
  }
  const kind = engagement.value[leadId];
  const result = await action('reply.post', {
    lead_id: leadId,
    variant,
    body,
    engagement_kind: kind && kind !== 'none' ? kind : undefined,
    note: 'posted manually from the reply console',
  });
  if (result) {
    done.value = { ...done.value, [leadId]: true };
    message.value = {
      kind: 'ok',
      text: `recorded as posted (${variantLabels[variant] ?? variant})${kind && kind !== 'none' ? ` · engagement: ${kind}` : ''}`,
    };
  }
}
</script>

<template>
  <section aria-label="Reply console">
    <div class="actions" style="justify-content: space-between">
      <p class="muted small" aria-live="polite">
        {{
          items.length === 0
            ? 'Nothing to reply to right now.'
            : `Card ${index + 1} of ${items.length}`
        }}
      </p>
      <p class="muted small">
        Shortcuts: <kbd>j</kbd>/<kbd>k</kbd> next/prev · <kbd>1</kbd><kbd>2</kbd
        ><kbd>3</kbd> variant · <kbd>c</kbd> copy · <kbd>o</kbd> open · <kbd>p</kbd> posted ·
        <kbd>g</kbd> generate
      </p>
    </div>

    <p
      v-if="message"
      :class="[
        'notice',
        message.kind === 'ok'
          ? 'notice--ok'
          : message.kind === 'error'
            ? 'notice--error'
            : 'notice--info',
      ]"
      role="status"
    >
      {{ message.text }}
    </p>

    <article v-if="item" class="card" :aria-label="`Reply to ${item.lead.title ?? 'opportunity'}`">
      <div class="page-head" style="margin-bottom: 0.5rem">
        <h2 style="margin: 0">
          <a :href="`/opportunities/${item.lead.id}`">{{ item.lead.title ?? '(no title)' }}</a>
        </h2>
        <span class="muted small">
          {{ item.lead.community ?? 'unknown community' }} · {{ item.lead.language ?? 'und' }} ·
          {{ item.lead.score ?? 'unknown' }} {{ item.lead.score_category ?? '' }} ·
          {{ item.lead.qualification_status }}
        </span>
      </div>

      <p v-if="item.lead.content_snippet" class="comment-body small">
        {{ item.lead.content_snippet }}
      </p>

      <p v-if="done[item.lead.id]" class="notice notice--ok" role="status">
        Recorded as posted. Move to the next card with <kbd>j</kbd>.
      </p>
      <p v-else-if="item.comments.length === 0" class="notice notice--info">
        No drafts yet for this lead.
        <button type="button" :disabled="busy" @click="generate(item.lead.id)">
          Generate drafts
        </button>
      </p>

      <div v-if="item.comments.length > 0">
        <div class="actions" role="tablist" aria-label="Comment variants">
          <button
            v-for="(variant, i) in variants"
            :key="variant"
            type="button"
            role="tab"
            :aria-selected="activeVariant(item.lead.id) === variant"
            :class="activeVariant(item.lead.id) === variant ? '' : 'secondary'"
            @click="selectVariant(item.lead.id, variant)"
          >
            {{ i + 1 }} · {{ variantLabels[variant] }}
            <span v-if="draftFor(item.lead.id, variant)" class="muted small"
              >({{ draftFor(item.lead.id, variant)?.status }})</span
            >
          </button>
        </div>

        <label :for="`reply-${item.lead.id}`">Reply text ({{ item.lead.language ?? 'und' }})</label>
        <textarea
          :id="`reply-${item.lead.id}`"
          :value="textFor(item.lead.id)"
          rows="7"
          spellcheck="false"
          @input="setText(item.lead.id, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>

        <div class="form-row" style="margin-top: 0.75rem">
          <div>
            <label :for="`engagement-${item.lead.id}`">Engagement (optional)</label>
            <select
              :id="`engagement-${item.lead.id}`"
              :value="engagement[item.lead.id] ?? 'none'"
              @change="setEngagement(item.lead.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="none">not recorded</option>
              <option value="reply">reply</option>
              <option value="dm">dm</option>
              <option value="meeting">meeting</option>
              <option value="interest">interest</option>
              <option value="lost">lost</option>
              <option value="other">other</option>
            </select>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="secondary" @click="copy(item.lead.id)">Copy</button>
          <button type="button" class="secondary" @click="openThread()">Open thread</button>
          <button
            type="button"
            :disabled="busy || done[item.lead.id]"
            @click="posted(item.lead.id)"
          >
            I posted it
          </button>
          <a :href="`/comments`">Comment Studio</a>
        </div>
        <p class="muted small">
          Posting stays manual: copy the text, post it on Reddit, then press “I posted it” to record
          the publication and the engagement. Nothing is sent to Reddit by this system.
        </p>
      </div>
    </article>

    <div class="actions">
      <button type="button" class="secondary" :disabled="index === 0" @click="go(-1)">
        ← Previous
      </button>
      <button type="button" class="secondary" :disabled="index >= items.length - 1" @click="go(1)">
        Next →
      </button>
    </div>
  </section>
</template>
