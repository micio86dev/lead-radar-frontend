<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ReplyConsoleView } from '../../lib/types';

/**
 * The reply console: a list of leads beside the one you are answering.
 *
 * The list exists because a queue you cannot see is a queue you cannot trust: the previous single-card
 * carousel showed "card 3 of 25" and nothing about what was waiting. Selecting a row is the only
 * navigation, and everything else on the screen belongs to the selected lead.
 */

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
  answered_at?: string | null;
  reply_skipped_at?: string | null;
  reply_skip_reason?: string | null;
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

const props = defineProps<{
  items: Item[];
  view?: ReplyConsoleView;
  stats?: {
    ready: number;
    needs_drafts: number;
    returned: number;
    to_reply: number;
    answered: number;
    skipped: number;
  };
  pacing?: { next_reply_at: string | null; retry_after_seconds: number; source: string | null };
}>();

const view = computed<ReplyConsoleView>(() => props.view ?? 'to_reply');
const rows = ref<Item[]>([...props.items]);
const index = ref(0);

const wait = ref<number>(props.pacing?.retry_after_seconds ?? 0);
let waitTimer: ReturnType<typeof setInterval> | undefined;
const waitLabel = computed<string>(() => {
  const total = Math.max(0, wait.value);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
});
const waitSource = computed<string>(() => {
  if (props.pacing?.source === 'reddit_reported') return 'Reddit told the browser widget to wait';
  if (props.pacing?.source === 'publication') return 'your own floor after the last reply';
  return 'recorded wait';
});

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

/** The API stores the reason as an enum; the screen shows a sentence. */
const skipReasonLabels: Record<string, string> = {
  not_relevant: 'not relevant to what we sell',
  no_product_fit: 'wrong product or market',
  community_rules: 'community rules forbid it',
  already_handled: 'handled somewhere else',
  other: 'another reason',
};
const skipReasons = [
  { value: 'not_relevant', label: 'Not relevant to what we sell' },
  { value: 'no_product_fit', label: 'Wrong product or market' },
  { value: 'community_rules', label: 'Community rules forbid it' },
  { value: 'already_handled', label: 'Handled somewhere else' },
  { value: 'other', label: 'Another reason' },
] as const;

const selected = ref<Record<string, string>>({});
const edited = ref<Record<string, string>>({});
const engagement = ref<Record<string, string>>({});
const done = ref<Record<string, boolean>>({});
const copied = ref<string | null>(null);
const busy = ref(false);
const skipReason = ref<string>('not_relevant');
const message = ref<{ kind: 'ok' | 'error' | 'info'; text: string; undo?: () => void } | null>(
  null,
);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const item = computed<Item | undefined>(() => rows.value[index.value]);
const activeVariant = (leadId: string): string => selected.value[leadId] ?? 'helpful';
const draftsFor = (leadId: string): Draft[] =>
  item.value && item.value.lead.id === leadId ? item.value.comments : [];
const draftFor = (leadId: string, variant: string): Draft | undefined =>
  draftsFor(leadId).find((draft) => draft.variant === variant);
const textFor = (leadId: string): string => {
  const variant = activeVariant(leadId);
  return edited.value[`${leadId}:${variant}`] ?? draftFor(leadId, variant)?.body ?? '';
};
const snippet = computed<string>(() => {
  const value = item.value?.lead.content_snippet?.trim() ?? '';
  return value.length > 900 ? `${value.slice(0, 900)}…` : value;
});
const scoreTone = (category: string | null): string => {
  if (category === 'hot') return 'badge--hot';
  if (category === 'warm') return 'badge--warm';
  if (category === 'potential') return 'badge--potential';
  return 'badge--low';
};

/** One label per row: what the operator needs to know to choose the next lead. */
function stateOf(lead: Lead): { label: string; tone: string } {
  if (lead.answered_at) return { label: 'answered', tone: 'badge--good' };
  if (lead.reply_skipped_at) return { label: 'ignored', tone: 'badge--low' };
  if (draftsFor(lead.id).length > 0) return { label: 'draft ready', tone: 'badge--potential' };
  return { label: 'needs draft', tone: 'badge--muted' };
}

const rowsHref = (leadId: string): string => `/opportunities/${leadId}`;

function select(next: number): void {
  if (next < 0 || next >= rows.value.length) return;
  index.value = next;
  message.value = null;
  copied.value = null;
}

function setText(leadId: string, value: string): void {
  edited.value = { ...edited.value, [`${leadId}:${activeVariant(leadId)}`]: value };
}

function selectVariant(leadId: string, variant: string): void {
  selected.value = { ...selected.value, [leadId]: variant };
  copied.value = null;
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
    message.value = { kind: 'ok', text: 'copied, paste it into the thread' };
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

async function generate(): Promise<void> {
  const current = item.value;
  if (!current) return;
  const result = await action('reply.prepare', { limit: 1 });
  if (result) {
    message.value = {
      kind: 'info',
      text: `queued ${String(result.queued ?? 0)} generation job(s), reload in a few seconds`,
    };
  }
}

async function posted(): Promise<void> {
  const current = item.value;
  if (!current) return;
  const leadId = current.lead.id;
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

/** Set the selected lead aside, or bring it back. Either way the list and the counts stay honest. */
async function setAside(lead: Lead, reason?: string): Promise<void> {
  const removing = Boolean(reason);
  const result = await action('reply.skip', {
    lead_id: lead.id,
    skipped: removing,
    reason,
  });
  if (!result) return;
  if (removing) {
    const previous = index.value;
    rows.value = rows.value.filter((row) => row.lead.id !== lead.id);
    index.value = Math.min(previous, Math.max(0, rows.value.length - 1));
    message.value = {
      kind: 'ok',
      text: 'marked as not replying; it moved to Ignored',
      undo: () => {
        void setAside(lead);
      },
    };
  } else {
    rows.value = rows.value.filter((row) => row.lead.id !== lead.id);
    index.value = Math.min(index.value, Math.max(0, rows.value.length - 1));
    message.value = { kind: 'ok', text: 'back in the queue' };
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
      select(index.value + 1);
      break;
    case 'k':
    case 'ArrowUp':
      select(index.value - 1);
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
      void posted();
      break;
    case 'g':
      void generate();
      break;
    case 's':
      if (!current.lead.answered_at) void setAside(current.lead, skipReason.value);
      break;
    default:
      return;
  }
  event.preventDefault();
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  if (wait.value > 0) {
    waitTimer = setInterval(() => {
      wait.value = Math.max(0, wait.value - 1);
      if (wait.value === 0 && waitTimer) clearInterval(waitTimer);
    }, 1000);
  }
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  if (copiedTimer) clearTimeout(copiedTimer);
  if (waitTimer) clearInterval(waitTimer);
});
</script>

<template>
  <section aria-label="Reply queue" class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <!-- A countdown is not a live region: announcing it every second would flood a screen reader. -->
      <p v-if="wait > 0" class="notice notice--info mb-0" role="timer">
        <strong class="text-ink">Reddit throttle:</strong> next reply in {{ waitLabel }} ({{
          waitSource
        }}). Stage a reply meanwhile; nothing is sent from here.
      </p>
      <p v-else class="muted small mb-0">
        Copy the reply, paste it into the thread, then record it.
      </p>
      <p class="muted small mb-0 hidden sm:block">
        <kbd>j</kbd><kbd>k</kbd> move · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> tone ·
        <kbd>c</kbd> copy · <kbd>o</kbd> open · <kbd>p</kbd> posted · <kbd>s</kbd> not replying
      </p>
    </div>

    <p
      v-if="message"
      :class="[
        'notice mb-0',
        message.kind === 'ok'
          ? 'notice--ok'
          : message.kind === 'error'
            ? 'notice--error'
            : 'notice--info',
      ]"
      role="status"
    >
      {{ message.text }}
      <button
        v-if="message.undo"
        type="button"
        class="ml-2 inline-flex items-center border-0 bg-transparent px-0 font-semibold text-inherit underline underline-offset-2 hover:bg-transparent"
        @click="message.undo()"
      >
        Undo
      </button>
    </p>

    <div class="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
      <!-- The queue itself: what is waiting, in one glance. -->
      <ul
        aria-label="Leads in this view"
        class="flex gap-2 overflow-x-auto pb-1 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto lg:pb-0"
      >
        <li v-for="(entry, i) in rows" :key="entry.lead.id" class="flex shrink-0 lg:shrink">
          <div
            :class="[
              'flex w-64 items-stretch overflow-hidden rounded-control border bg-raised lg:w-full',
              i === index ? 'border-accent' : 'border-line',
            ]"
          >
            <button
              type="button"
              :class="[
                'flex min-w-0 flex-1 flex-col items-start gap-1 rounded-none border-0 px-3 py-2 text-left transition-colors',
                i === index
                  ? 'bg-accent-soft text-ink'
                  : 'bg-raised text-ink hover:bg-sunken hover:text-ink',
              ]"
              :aria-current="i === index ? 'true' : undefined"
              @click="select(i)"
            >
              <span class="flex w-full items-center justify-between gap-2">
                <span class="badge" :class="scoreTone(entry.lead.score_category)">
                  {{ entry.lead.score ?? '–' }}
                </span>
                <span class="text-[0.68rem] font-semibold tracking-wide text-ink-muted uppercase">
                  {{ entry.lead.language ?? 'und' }}
                </span>
              </span>
              <span class="line-clamp-2 text-sm font-semibold text-ink">
                {{ entry.lead.title ?? '(no title)' }}
              </span>
              <span class="w-full truncate text-xs text-ink-muted">
                {{ entry.lead.community ?? 'unknown community' }}
              </span>
              <span class="badge" :class="stateOf(entry.lead).tone">
                {{ stateOf(entry.lead).label }}
              </span>
            </button>
            <button
              v-if="!entry.lead.answered_at && !entry.lead.reply_skipped_at"
              type="button"
              class="rounded-none border-0 border-l border-line bg-raised px-2 text-[0.7rem] font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
              :aria-label="`Not replying to ${entry.lead.title ?? 'this lead'}`"
              :disabled="busy"
              @click="setAside(entry.lead, skipReason)"
            >
              Skip
            </button>
          </div>
        </li>
      </ul>

      <!-- The workspace: everything about the selected lead. -->
      <article
        v-if="item"
        class="overflow-hidden rounded-panel border border-line bg-raised shadow-panel"
        :aria-label="`Reply to ${item.lead.title ?? 'opportunity'}`"
      >
        <header class="border-b border-line bg-sunken px-4 py-4">
          <div class="mb-2 flex flex-wrap items-center gap-1.5">
            <span class="badge badge--muted">{{ item.lead.community ?? 'unknown community' }}</span>
            <span class="badge" :class="scoreTone(item.lead.score_category)">
              {{ item.lead.score ?? '–' }} {{ item.lead.score_category ?? 'unscored' }}
            </span>
            <span class="badge badge--muted">
              {{ item.lead.qualification_status.replace(/_/g, ' ') }}
            </span>
            <span v-if="item.lead.answered_at" class="badge badge--good">
              answered {{ new Date(item.lead.answered_at).toLocaleDateString() }}
            </span>
            <span v-if="item.lead.reply_skipped_at" class="badge badge--low">
              ignored {{ new Date(item.lead.reply_skipped_at).toLocaleDateString() }}
            </span>
          </div>

          <h2 class="max-w-[68ch] text-lg leading-snug font-semibold text-ink">
            <a
              v-if="item.lead.url"
              :href="item.lead.url"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:underline"
            >
              {{ item.lead.title ?? '(no title)' }} <span aria-hidden="true">↗</span>
            </a>
            <template v-else>{{ item.lead.title ?? '(no title)' }}</template>
          </h2>

          <p v-if="snippet" class="mt-2 max-w-[70ch] text-sm whitespace-pre-wrap text-ink-muted">
            {{ snippet }}
          </p>
          <p v-else class="muted small mt-2">No text stored for this post.</p>

          <div class="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <a
              v-if="item.lead.url"
              class="font-semibold text-accent hover:underline"
              :href="item.lead.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on Reddit <span aria-hidden="true">↗</span>
            </a>
            <a class="text-ink-muted hover:underline" :href="rowsHref(item.lead.id)">
              Lead details
            </a>
          </div>
        </header>

        <!-- A lead you set aside: show why, and the way back. -->
        <section v-if="view === 'ignored'" class="px-4 py-4" aria-label="Ignored lead">
          <h3 class="text-base font-semibold">You are not replying to this one</h3>
          <p class="mt-1 text-sm text-ink-muted">
            Reason:
            <strong class="text-ink">{{
              skipReasonLabels[item.lead.reply_skip_reason ?? ''] ??
              item.lead.reply_skip_reason ??
              'not recorded'
            }}</strong>
            <template v-if="item.lead.reply_skipped_at">
              · since {{ new Date(item.lead.reply_skipped_at).toLocaleDateString() }}
            </template>
          </p>
          <button
            type="button"
            class="mt-3 inline-flex min-h-6 items-center rounded-control border border-line bg-raised px-3.5 py-1.5 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken hover:text-ink disabled:opacity-55"
            :disabled="busy"
            @click="setAside(item.lead)"
          >
            Bring it back to the queue
          </button>
        </section>

        <!-- The reply itself sits directly under the post. -->
        <section v-else class="px-4 py-4" aria-label="Draft reply">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-base font-semibold">Your reply</h3>
            <button
              v-if="item.comments.length > 0"
              type="button"
              :class="[
                'inline-flex min-h-6 items-center rounded-control border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                copied === `${item.lead.id}:${activeVariant(item.lead.id)}`
                  ? 'border-good bg-good-soft text-good'
                  : 'border-accent bg-accent text-accent-ink hover:border-accent-strong hover:bg-accent-strong',
              ]"
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
            <div
              v-if="!item.lead.answered_at"
              class="mt-2 flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Reply tone"
            >
              <button
                v-for="(variant, i) in variants"
                :key="variant"
                type="button"
                role="tab"
                :aria-selected="activeVariant(item.lead.id) === variant"
                :class="[
                  'inline-flex min-h-6 items-center gap-1 rounded-control border px-2.5 py-1 text-xs font-semibold',
                  activeVariant(item.lead.id) === variant
                    ? 'border-line-strong bg-sunken text-ink'
                    : 'border-line bg-raised text-ink-muted hover:bg-sunken hover:text-ink',
                ]"
                :title="variantHints[variant]"
                @click="selectVariant(item.lead.id, variant)"
              >
                <kbd>{{ i + 1 }}</kbd> {{ variantLabels[variant] }}
              </button>
            </div>

            <textarea
              :id="`reply-${item.lead.id}`"
              class="mt-2 block w-full resize-y rounded-control border border-line bg-canvas px-3 py-2 text-sm leading-relaxed text-ink"
              :value="textFor(item.lead.id)"
              rows="7"
              spellcheck="false"
              :aria-label="`${variantLabels[activeVariant(item.lead.id)]} reply, editable`"
              @input="setText(item.lead.id, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="inline-flex min-h-6 items-center rounded-control border border-line bg-raised px-3.5 py-1.5 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken hover:text-ink"
                @click="openThread()"
              >
                Open on Reddit <span aria-hidden="true">↗</span>
              </button>
              <button
                type="button"
                class="inline-flex min-h-6 items-center rounded-control border border-line bg-raised px-3.5 py-1.5 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken hover:text-ink disabled:opacity-55"
                :disabled="busy || done[item.lead.id] || Boolean(item.lead.answered_at)"
                @click="posted()"
              >
                {{ item.lead.answered_at || done[item.lead.id] ? 'Posted ✓' : 'I posted it' }}
              </button>
              <button
                v-if="!item.lead.answered_at"
                type="button"
                class="ml-auto inline-flex items-center border-0 bg-transparent px-0 text-sm font-semibold text-ink-muted underline-offset-2 hover:bg-transparent hover:text-ink hover:underline disabled:opacity-55"
                :disabled="busy"
                @click="setAside(item.lead, skipReason)"
              >
                Not replying
              </button>
            </div>
            <p class="muted small mt-2">
              Copy, paste into Reddit, then press “I posted it” to record the publication. Nothing
              is sent to Reddit by this system.
            </p>
          </template>

          <div v-else class="mt-3">
            <p class="muted text-sm">No drafts yet for this lead.</p>
            <button
              type="button"
              class="mt-2 inline-flex min-h-6 items-center rounded-control border border-accent bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink hover:border-accent-strong hover:bg-accent-strong disabled:opacity-55"
              :disabled="busy"
              @click="generate()"
            >
              Generate drafts
            </button>
          </div>

          <p v-if="done[item.lead.id]" class="notice notice--ok mt-3 mb-0" role="status">
            Recorded as posted. <kbd>j</kbd> moves to the next lead.
          </p>
        </section>

        <!-- Engagement is real work but not the main flow, so it stays out of the way. -->
        <details class="border-t border-line px-4 py-3">
          <summary class="cursor-pointer text-sm font-semibold text-ink-muted">
            Reason for ignoring and other details
          </summary>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <div v-if="!item.lead.answered_at && !item.lead.reply_skipped_at">
              <label :for="`skip-${item.lead.id}`">Why you are not replying</label>
              <select
                :id="`skip-${item.lead.id}`"
                v-model="skipReason"
                class="w-full rounded-control border border-line bg-raised px-2.5 py-1.5 text-sm"
              >
                <option v-for="reason in skipReasons" :key="reason.value" :value="reason.value">
                  {{ reason.label }}
                </option>
              </select>
            </div>
            <div>
              <label :for="`engagement-${item.lead.id}`">Engagement after posting (optional)</label>
              <select
                :id="`engagement-${item.lead.id}`"
                :value="engagement[item.lead.id] ?? 'none'"
                class="w-full rounded-control border border-line bg-raised px-2.5 py-1.5 text-sm"
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
          <p class="muted small mt-3">
            <a class="hover:underline" href="/comments">Comment Studio</a> ·
            <a class="hover:underline" :href="rowsHref(item.lead.id)">lead page</a> ·
            <span v-if="draftFor(item.lead.id, activeVariant(item.lead.id))">
              draft v{{ draftFor(item.lead.id, activeVariant(item.lead.id))?.version }} ·
              {{ draftFor(item.lead.id, activeVariant(item.lead.id))?.status }}
            </span>
          </p>
        </details>
      </article>
    </div>

    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="inline-flex min-h-6 items-center rounded-control border border-line bg-raised px-3.5 py-1.5 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken hover:text-ink disabled:opacity-55"
        :disabled="index === 0"
        @click="select(index - 1)"
      >
        ← Previous
      </button>
      <p class="muted small mb-0">{{ index + 1 }} of {{ rows.length }} in this view</p>
      <button
        type="button"
        class="inline-flex min-h-6 items-center rounded-control border border-line bg-raised px-3.5 py-1.5 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken hover:text-ink disabled:opacity-55"
        :disabled="index >= rows.length - 1"
        @click="select(index + 1)"
      >
        Next →
      </button>
    </div>
  </section>
</template>
