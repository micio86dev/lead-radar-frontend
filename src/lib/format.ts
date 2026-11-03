/** Presentation helpers. Unknown values render as "unknown"; they are never shown as zero. */

const ENUM_LABELS: Record<string, string> = {
  hr_recruiting: 'HR & recruiting',
  international_meetings: 'International meetings',
  conferences_webinars: 'Conferences & webinars',
  customer_support: 'Customer support',
  tourism_hospitality: 'Tourism & hospitality',
  other: 'Other',
  explicit_solution_request: 'Explicit solution request',
  active_problem: 'Active problem',
  latent_problem: 'Latent problem',
  product_comparison: 'Product comparison',
  general_discussion: 'General discussion',
  irrelevant: 'Irrelevant',
  b2b: 'B2B',
  b2c: 'B2C',
  unknown: 'Unknown',
  none: 'None',
  weak: 'Weak',
  moderate: 'Moderate',
  strong: 'Strong',
  explicit: 'Explicit',
  low: 'Low',
  high: 'High',
  very_high: 'Very high',
  poor: 'Poor',
  partial: 'Partial',
  good: 'Good',
  excellent: 'Excellent',
  hot: 'HOT',
  warm: 'WARM',
  potential: 'POTENTIAL',
  qualified: 'Qualified',
  needs_review: 'Needs review',
  rejected: 'Rejected',
  pending: 'Pending',
  validated: 'Validated',
  in_review: 'In review',
  resolved: 'Resolved',
  draft: 'Draft',
  pending_review: 'Pending review',
  needs_edit: 'Needs edit',
  approved: 'Approved',
  published_manually: 'Published manually',
  helpful: 'Helpful',
  soft_pitch: 'Soft pitch',
  direct_pitch: 'Direct pitch',
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  dead_letter: 'Dead letter',
  cancelled: 'Cancelled',
  aborted: 'Aborted',
  timed_out: 'Timed out',
  unconfigured: 'Unconfigured',
  disabled: 'Disabled',
  ok: 'OK',
  error: 'Error',
  reply: 'Reply',
  dm: 'DM',
  meeting: 'Meeting',
  interest: 'Interest',
  lost: 'Lost',
  actual: 'Actual',
  estimate: 'Estimate',
};

export function label(value: string | null | undefined): string {
  if (!value) return 'unknown';
  return ENUM_LABELS[value] ?? value.replaceAll('_', ' ');
}

/** Money is rendered with its own currency; a missing value stays "unknown". */
export function formatMoney(
  value: number | null | undefined,
  currency: string,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  return `${value.toFixed(fractionDigits)} ${currency}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  return parsed.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
}

export function scoreClass(category: string | null | undefined): string {
  switch (category) {
    case 'hot':
      return 'badge badge--hot';
    case 'warm':
      return 'badge badge--warm';
    case 'potential':
      return 'badge badge--potential';
    default:
      return 'badge badge--low';
  }
}

export function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'ok':
    case 'succeeded':
    case 'approved':
    case 'validated':
    case 'published_manually':
      return 'badge badge--good';
    case 'error':
    case 'failed':
    case 'rejected':
    case 'dead_letter':
      return 'badge badge--bad';
    default:
      return 'badge badge--muted';
  }
}

/** Short cost note: distinguishes actual charges, estimates and unknown costs. */
export function costSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'actual':
      return 'provider-reported charges';
    case 'estimate':
      return 'configured estimates only';
    default:
      return 'unknown cost';
  }
}

export function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
