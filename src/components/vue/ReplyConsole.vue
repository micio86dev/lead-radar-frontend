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
const variantHints: Record<string, string> = {
  helpful: 'Answer the question, no pitch',
  soft_pitch: 'Answer, then a light mention',
  direct_pitch: 'Lead with what you sell',
};

const index = ref(0);
const selected = ref<Record<string, string>>({});
const edited = ref<Record<string, string>>({});
const engagement = ref<Record<string, string>>({});
const done = ref<Record<string, boolean>>({});
const copied = ref<string | null>(null);
const busy = ref(false);
const message = ref<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

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
const scoreTone = (category: string | null): string => {
  if (category === 'hot') return 'chip chip--hot';
  if (category === 'warm') return 'chip chip--warm';
  return 'chip';
};
const snippet = computed<string>(() => {
  const value = item.value?.lead.content_snippet?.trim() ?? '';
  return value.length > 900 ? `${value.slice(0, 900)}…` : value;
});

function selectVariant(leadId: string, variant: string): void {
  selected.value = { ...selected.value, [leadId]: variant };
  copied.value = null;
}

function setText(leadId: string, value: string): void {
  edited.value = { ...edited.value, [`${leadId}:${activeVariant(leadId)}`]: value };
}

function go(delta: number): void {
  const next = index.value + delta;
  if (next >= 0 && next < props.items.length) {
    index.value = next;
    message.value = null;
    copied.value = null;
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
  const text = textFor(leadId);
  if (!text.trim()) {
    message.value = { kind: 'error', text: 'nothing to copy yet: write or generate the reply' };
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    copied.value = `${leadId}:${activeVariant(leadId)}`;
    message.value = { kind: 'ok', text: 'copied — paste it into the thread' };
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = null;
    }, 2000);
  } catch {
    message.value = { kind: 'error', text: 'clipboard blocked: select the text and copy manually' };
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
      text: `queued ${String(result.queued ?? 0)} generation job(s) for ${leadId.slice(0, 8)}… — reload in a few seconds`,
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
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  if (copiedTimer) clearTimeout(copiedTimer);
});

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
  <section aria-label="Reply queue" class="queue">
    <div class="queue-bar">
      <p class="muted small">
        {{
          items.length === 0
            ? 'Nothing to reply to right now.'
            : `Card ${index + 1} of ${items.length}`
        }}
      </p>
      <p class="muted small shortcuts">
        <kbd>j</kbd><kbd>k</kbd> move · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> tone ·
        <kbd>c</kbd> copy · <kbd>o</kbd> open · <kbd>p</kbd> posted
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

    <article v-if="item" class="sheet" :aria-label="`Reply to ${item.lead.title ?? 'opportunity'}`">
      <!-- What you are answering, with the way in. -->
      <header class="source">
        <div class="chips">
          <span class="chip chip--strong">{{ item.lead.community ?? 'unknown community' }}</span>
          <span :class="scoreTone(item.lead.score_category)">
            {{ item.lead.score ?? '–' }}
            {{ item.lead.score_category ?? 'unscored' }}
          </span>
          <span class="chip">{{ item.lead.qualification_status.replace(/_/g, ' ') }}</span>
          <span class="chip">{{ item.lead.language ?? 'und' }}</span>
        </div>

        <h2 class="source-title">
          <a v-if="item.lead.url" :href="item.lead.url" target="_blank" rel="noopener noreferrer">
            {{ item.lead.title ?? '(no title)' }}
            <span class="source-arrow" aria-hidden="true">↗</span>
          </a>
          <template v-else>{{ item.lead.title ?? '(no title)' }}</template>
        </h2>

        <p v-if="snippet" class="source-body">{{ snippet }}</p>
        <p v-else class="muted small">No text stored for this post.</p>

        <div class="source-links">
          <a
            v-if="item.lead.url"
            class="link-button"
            :href="item.lead.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on Reddit <span aria-hidden="true">↗</span>
          </a>
          <a class="muted small" :href="`/opportunities/${item.lead.id}`">Lead details</a>
        </div>
      </header>

      <!-- The reply itself sits directly under the post. -->
      <section class="reply" aria-label="Draft reply">
        <div class="reply-head">
          <h3>Your reply</h3>
          <div class="segmented" role="tablist" aria-label="Reply tone">
            <button
              v-for="(variant, i) in variants"
              :key="variant"
              type="button"
              role="tab"
              :aria-selected="activeVariant(item.lead.id) === variant"
              :class="{ 'segmented-on': activeVariant(item.lead.id) === variant }"
              :title="variantHints[variant]"
              :disabled="item.comments.length === 0"
              @click="selectVariant(item.lead.id, variant)"
            >
              <kbd>{{ i + 1 }}</kbd> {{ variantLabels[variant] }}
            </button>
          </div>
          <button
            v-if="item.comments.length > 0"
            type="button"
            class="copy-cta"
            :class="{
              'copy-cta--done': copied === `${item.lead.id}:${activeVariant(item.lead.id)}`,
            }"
            @click="copy(item.lead.id)"
          >
            {{
              copied === `${item.lead.id}:${activeVariant(item.lead.id)}`
                ? 'Copied ✓'
                : 'Copy reply'
            }}
          </button>
        </div>

        <template v-if="item.comments.length > 0">
          <textarea
            :id="`reply-${item.lead.id}`"
            class="reply-text"
            :value="textFor(item.lead.id)"
            rows="6"
            spellcheck="false"
            :aria-label="`${variantLabels[activeVariant(item.lead.id)]} reply, editable`"
            @input="setText(item.lead.id, ($event.target as HTMLTextAreaElement).value)"
          ></textarea>

          <div class="reply-actions">
            <button
              type="button"
              class="copy-cta"
              :class="{
                'copy-cta--done': copied === `${item.lead.id}:${activeVariant(item.lead.id)}`,
              }"
              @click="copy(item.lead.id)"
            >
              {{
                copied === `${item.lead.id}:${activeVariant(item.lead.id)}`
                  ? 'Copied ✓'
                  : 'Copy reply'
              }}
            </button>
            <button type="button" class="secondary" @click="openThread()">
              Open on Reddit <span aria-hidden="true">↗</span>
            </button>
            <button
              type="button"
              class="secondary"
              :disabled="busy || done[item.lead.id]"
              @click="posted(item.lead.id)"
            >
              {{ done[item.lead.id] ? 'Posted ✓' : 'I posted it' }}
            </button>
          </div>
          <p class="muted small reply-hint">
            Copy, paste into Reddit, then press “I posted it” to record the publication. Nothing is
            sent to Reddit by this system.
          </p>
        </template>

        <div v-else class="empty-reply">
          <p class="muted">No drafts yet for this lead.</p>
          <button type="button" :disabled="busy" @click="generate(item.lead.id)">
            Generate drafts
          </button>
        </div>

        <p v-if="done[item.lead.id]" class="notice notice--ok" role="status">
          Recorded as posted. <kbd>j</kbd> moves to the next card.
        </p>
      </section>

      <details class="more">
        <summary>Record engagement and other views</summary>
        <div class="more-body">
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
          <p class="muted small">
            <a :href="`/comments`">Comment Studio</a> ·
            <a :href="`/opportunities/${item.lead.id}`">lead page</a> ·
            <span v-if="draftFor(item.lead.id, activeVariant(item.lead.id))">
              draft v{{ draftFor(item.lead.id, activeVariant(item.lead.id))?.version }} ·
              {{ draftFor(item.lead.id, activeVariant(item.lead.id))?.status }}
            </span>
          </p>
        </div>
      </details>
    </article>

    <div class="queue-nav">
      <button type="button" class="secondary" :disabled="index === 0" @click="go(-1)">
        ← Previous
      </button>
      <button type="button" class="secondary" :disabled="index >= items.length - 1" @click="go(1)">
        Next →
      </button>
    </div>
  </section>
</template>

<style scoped>
.queue {
  display: grid;
  gap: var(--space-3);
}

.queue-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  justify-content: space-between;
  align-items: baseline;
}

.queue-bar p {
  margin: 0;
}

.shortcuts kbd {
  margin-right: 1px;
}

.sheet {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.source {
  padding: var(--space-4) var(--space-5);
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.chip--strong {
  color: var(--text);
}

.chip--hot {
  background: var(--bad-bg);
  border-color: #f0c2c2;
  color: var(--bad);
}

.chip--warm {
  background: var(--warn-bg);
  border-color: #ecd3a2;
  color: var(--warn);
}

.source-title {
  margin: 0 0 var(--space-2);
  font-size: 1.2rem;
  line-height: 1.35;
  max-width: 68ch;
}

.source-title a {
  color: var(--text);
  text-decoration: none;
}

.source-title a:hover {
  text-decoration: underline;
}

.source-arrow {
  color: var(--accent);
  font-size: 0.95em;
}

.source-body {
  margin: 0 0 var(--space-3);
  max-width: 68ch;
  color: var(--text);
  white-space: pre-wrap;
}

.source-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.link-button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  background: var(--surface);
  transition:
    background 150ms ease-out,
    color 150ms ease-out;
}

.link-button:hover {
  background: var(--accent);
  color: var(--surface);
}

.reply {
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.reply-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  margin-bottom: var(--space-3);
}

.reply-head .copy-cta {
  margin-left: auto;
}

.reply-head h3 {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  background: var(--surface-alt);
  border-radius: 8px;
}

.segmented button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.86rem;
  font-weight: 600;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 150ms ease-out;
}

.segmented button:hover {
  background: var(--surface);
  color: var(--text);
}

.segmented .segmented-on {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgb(20 24 31 / 12%);
}

.segmented kbd {
  font-size: 0.7rem;
  padding: 0 3px;
  background: transparent;
  border: 0;
  color: var(--text-muted);
}

.reply-text {
  width: 100%;
  min-height: 8.5rem;
  max-height: 17rem;
  font: inherit;
  font-size: 1rem;
  line-height: 1.6;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  resize: vertical;
}

.reply-text:focus-visible {
  border-color: var(--focus);
}

.reply-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-3);
}

.copy-cta {
  font-size: 1rem;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--surface);
  font-weight: 700;
  cursor: pointer;
  transition:
    background 150ms ease-out,
    transform 120ms ease-out;
}

.copy-cta:hover {
  background: var(--accent-strong);
}

.copy-cta:active {
  transform: translateY(1px);
}

.copy-cta--done {
  background: var(--good);
  border-color: var(--good);
}

.reply-hint {
  margin: var(--space-3) 0 0;
}

.empty-reply {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}

.empty-reply p {
  margin: 0;
}

.more {
  border-top: 1px solid var(--border);
  padding: var(--space-3) var(--space-5);
}

.more summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.86rem;
  font-weight: 600;
}

.more-body {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.more-body p {
  margin: 0;
}

.queue-nav {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 720px) {
  .reply-head .copy-cta {
    margin-left: 0;
    width: 100%;
  }
}

@media (max-width: 640px) {
  .source,
  .reply {
    padding: var(--space-3) var(--space-4);
  }

  .more {
    padding: var(--space-3) var(--space-4);
  }
}
</style>
