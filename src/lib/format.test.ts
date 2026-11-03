import { describe, expect, it } from 'vitest';

import {
  costSourceLabel,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  label,
  scoreClass,
  statusClass,
  truncate,
} from './format';

describe('format helpers', () => {
  it('never renders an unknown cost as zero', () => {
    expect(formatMoney(null, 'USD')).toBe('unknown');
    expect(formatMoney(undefined, 'EUR')).toBe('unknown');
    expect(formatMoney(0, 'USD')).toBe('0.00 USD');
    expect(formatMoney(1.239, 'USD')).toBe('1.24 USD');
  });

  it('formats numbers and percentages', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(null)).toBe('unknown');
    expect(formatPercent(0.815)).toBe('81.5%');
    expect(formatPercent(null)).toBe('unknown');
  });

  it('formats timestamps in UTC and rejects garbage', () => {
    expect(formatDateTime('2024-05-01T10:00:00Z')).toBe('2024-05-01 10:00:00 UTC');
    expect(formatDateTime('not a date')).toBe('unknown');
    expect(formatDateTime(null)).toBe('unknown');
  });

  it('labels enums and falls back to readable spellings', () => {
    expect(label('hr_recruiting')).toBe('HR & recruiting');
    expect(label('custom_value')).toBe('custom value');
    expect(label(null)).toBe('unknown');
  });

  it('maps score and status to badges', () => {
    expect(scoreClass('hot')).toBe('badge badge--hot');
    expect(scoreClass(null)).toBe('badge badge--low');
    expect(statusClass('approved')).toBe('badge badge--good');
    expect(statusClass('dead_letter')).toBe('badge badge--bad');
    expect(statusClass('queued')).toBe('badge badge--muted');
  });

  it('describes the cost source honestly', () => {
    expect(costSourceLabel('actual')).toBe('provider-reported charges');
    expect(costSourceLabel('estimate')).toBe('configured estimates only');
    expect(costSourceLabel('unknown')).toBe('unknown cost');
  });

  it('truncates long text with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('abcdefghijklmno', 10)).toBe('abcdefghi…');
  });
});
