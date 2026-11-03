import { describe, expect, it } from 'vitest';

import { buildQuery, readIntParam, readParam } from './query';

describe('query helpers', () => {
  it('skips empty values and keeps order', () => {
    expect(buildQuery({ vertical: 'hr_recruiting', intent: undefined, q: '' })).toBe(
      '?vertical=hr_recruiting',
    );
    expect(buildQuery({ page: 2, per_page: 25 })).toBe('?page=2&per_page=25');
    expect(buildQuery({})).toBe('');
  });

  it('reads parameters safely', () => {
    const url = new URL('http://localhost/opportunities?vertical=hr_recruiting&page=3&empty=');
    expect(readParam(url, 'vertical')).toBe('hr_recruiting');
    expect(readParam(url, 'missing')).toBeUndefined();
    expect(readParam(url, 'empty')).toBeUndefined();
    expect(readIntParam(url, 'page', 1)).toBe(3);
    expect(readIntParam(url, 'per_page', 25)).toBe(25);
  });

  it('rejects invalid integers', () => {
    const url = new URL('http://localhost/opportunities?page=-2&per_page=abc');
    expect(readIntParam(url, 'page', 1)).toBe(1);
    expect(readIntParam(url, 'per_page', 25)).toBe(25);
  });
});
