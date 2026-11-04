/** Types mirroring the HTTP contract in lead-radar/docs/api.md. */

export interface Paginated<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
}

export interface OpportunityListItem {
  id: string;
  title: string | null;
  snippet: string;
  language: string | null;
  source_id: string | null;
  source_name: string | null;
  community: string | null;
  url: string | null;
  published_at: string | null;
  discovered_at: string;
  vertical_primary: string;
  vertical_secondary: string[];
  intent: string;
  customer_type: string;
  buying_intent: string;
  business_potential: string;
  product_fit: string;
  score: number | null;
  score_category: string | null;
  qualification_status: string;
  review_status: string;
  confidence: number | null;
  evidence_count: number;
  comment_count: number;
  created_at: string;
}

export interface Evidence {
  excerpt: string;
  start_offset: number;
  end_offset: number;
}

export interface DecisionAnswer {
  question: string;
  type: string;
  value: number | null;
  noul: number | null;
  choice: string | null;
  score: number | null;
  probabilities: Record<string, number> | null;
  confidence: number | null;
}

export interface Decision {
  provider: string;
  model: string;
  model_version: string | null;
  provider_request_id: string | null;
  confidence: number | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  answers: DecisionAnswer[];
}

export interface ScoreComponent {
  dimension: string;
  weight: number;
  raw: number | null;
  normalized: number | null;
  contribution: number;
}

export interface ScoreBreakdown {
  version: number;
  score: number;
  category: string;
  components: ScoreComponent[];
  inputs: Record<string, unknown>;
  created_at: string;
}

export interface CommentSummary {
  id: string;
  lead_id: string;
  lead_title: string | null;
  variant: string;
  status: string;
  language: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface CommentVersion {
  version: number;
  body: string;
  actor: string;
  created_at: string;
}

export interface ReviewEvent {
  event: string;
  actor: string;
  note: string | null;
  created_at: string;
}

export interface CommentDetail extends CommentSummary {
  lead: { id: string; title: string | null; url: string | null; language: string | null };
  versions: CommentVersion[];
  review_events: ReviewEvent[];
  publication_note: string | null;
}

export interface Engagement {
  id: string;
  lead_id: string;
  comment_id: string | null;
  kind: string;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

export interface OpportunityDetail extends OpportunityListItem {
  content: string;
  author: string | null;
  engagement: { comments: number; upvotes: number; shares: number } | null;
  evidence: Evidence[];
  score_breakdown: ScoreBreakdown | null;
  decision: Decision | null;
  analyses: Analysis[];
  comments: CommentSummary[];
  engagements: Engagement[];
}

export interface Analysis {
  id: string;
  kind: string;
  provider: string;
  model: string;
  summary: string | null;
  error: string | null;
  created_at: string;
}

export interface Dashboard {
  totals: {
    opportunities: number;
    new_opportunities: number;
    hot: number;
    warm: number;
    potential: number;
    low: number;
  };
  by_vertical: { vertical: string; count: number }[];
  by_intent: { intent: string; count: number }[];
  recent_opportunities: OpportunityListItem[];
  ai_decisions: { total: number; providers: { provider: string; count: number }[] };
  review_queue: { pending_review: number; needs_edit: number; approved: number };
  providers: ProviderStatus[];
  apify: {
    budget_eur: number;
    daily_budget_eur: number;
    known_actual_usd: number | null;
    estimated_usd: number | null;
    remaining_known_eur: number | null;
    runs: number;
    results: number;
    errors: number;
    kill_switch: boolean;
    cost_source: string;
  };
  job_failures: { failed: number; dead_letter: number };
  costs: ProviderCost[];
}

export interface ProviderStatus {
  provider: string;
  kind: string;
  configured: boolean;
  enabled: boolean;
  model: string | null;
  status: string;
  last_request_at: string | null;
  last_latency_ms: number | null;
  last_error: string | null;
  /** Timestamp of the most recent successful call, if any. */
  last_success_at: string | null;
  /** Timestamp of the most recent failed call, if any. */
  last_error_at: string | null;
  /** True when the last recorded outcome is a failure older than the staleness window. */
  stale: boolean;
  usage: { requests: number; input_tokens: number; output_tokens: number };
  base_url: string | null;
}

export interface ProviderCost {
  provider: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  actual_cost_usd: number | null;
  estimated_cost_usd: number | null;
  unknown_cost_requests: number;
  currency: string;
}

export interface Community {
  id: string;
  name: string;
  vertical: string;
  validation_status: string;
  enabled: boolean;
  notes: string | null;
  last_checked_at: string | null;
  created_at: string;
  /** allowed | ask_mods | forbidden | unknown. Unknown is not permission. */
  self_promotion: string;
  min_account_age_days: number;
  min_comment_karma: number;
  flair_required: boolean;
  promo_cooldown_days: number;
  rules_summary: string;
}

export interface Source {
  id: string;
  name: string;
  provider: string;
  source_type: string;
  enabled: boolean;
  validation_status: string;
  notes: string | null;
  config: Record<string, unknown>;
  last_run_at: string | null;
  created_at: string;
}

export interface SearchProfile {
  id: string;
  name: string;
  vertical: string;
  enabled: boolean;
  keywords: string[];
  negative_keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface Actor {
  id: string;
  provider: string;
  actor_id: string;
  name: string;
  description: string;
  source_type: string;
  enabled: boolean;
  validation_status: string;
  input_template: Record<string, unknown>;
  max_items_per_run: number;
  cost_per_run_estimate: number | null;
  last_success_at: string | null;
  created_at: string;
}

export interface ApifyRun {
  id: string;
  actor_registry_id: string;
  actor_name: string;
  status: string;
  items_count: number;
  dataset_id: string | null;
  cost_estimate_usd: number | null;
  cost_actual_usd: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  job_id: string | null;
  created_at: string;
}

export interface ApifyUsage {
  budget_eur: number;
  daily_budget_eur: number;
  max_run_cost_eur: number;
  max_concurrent_runs: number;
  max_items_per_run: number;
  known_actual_usd: number | null;
  estimated_usd: number | null;
  remaining_known_eur: number | null;
  runs_total: number;
  runs_running: number;
  results_total: number;
  errors_total: number;
  kill_switch: boolean;
  cost_source: string;
  currency_note: string;
}

export interface BenchmarkRun {
  id: string;
  dataset: string;
  status: string;
  providers: string[];
  item_count: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface BenchmarkMetrics {
  count: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  false_positive_rate: number;
  false_negative_rate: number;
  confusion_matrix: { tp: number; fp: number; tn: number; fn_: number };
  per_language: {
    language: string;
    count: number;
    precision: number;
    recall: number;
    f1: number;
  }[];
}

export interface BenchmarkResult {
  provider: string;
  model: string;
  model_version: string | null;
  metrics: BenchmarkMetrics;
  latency_ms_avg: number | null;
  cost_per_1000_usd: number | null;
  unknown_costs: number;
  created_at: string;
}

export interface BenchmarkDetail extends BenchmarkRun {
  results: BenchmarkResult[];
}

export interface Job {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  tenant: { id: string; name: string };
  operational: {
    worker_concurrency?: number;
    ai_concurrency?: number;
    job_max_attempts?: number;
    retention_days?: number;
  };
  budgets: {
    apify_total_budget_eur?: number;
    apify_daily_budget_eur?: number;
    apify_max_run_cost_eur?: number;
    apify_max_items_per_run?: number;
    apify_max_concurrent_runs?: number;
    kill_switch?: boolean;
    currency?: string;
  };
  providers: ProviderStatus[];
}

export interface Project {
  id: string;
  name: string;
  summary: string;
  website_urls: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectCommunityMatch {
  community_id: string;
  name: string;
  vertical: string;
  enabled: boolean;
  relevance: number;
  reason: string;
  matched_at: string;
}

export interface ProjectDetail {
  project: Project;
  communities: ProjectCommunityMatch[];
}

export interface ProjectAnalysis {
  project_id: string;
  candidates: number;
  matched: number;
  provider: string;
  model: string;
  pages: { url: string; read: boolean; error: string | null }[];
  communities: ProjectCommunityMatch[];
}
