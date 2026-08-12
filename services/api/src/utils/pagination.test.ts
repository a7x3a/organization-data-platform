import { describe, it, expect } from 'vitest';
import { parsePagination, buildPaginatedResult, toPrismaSkipTake } from './pagination';

describe('parsePagination', () => {
  it('defaults to page 1, pageSize 20 when nothing is given', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('parses string query params', () => {
    expect(parsePagination({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('clamps page below 1 up to 1', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1);
    expect(parsePagination({ page: '-5' }).page).toBe(1);
  });

  it('clamps pageSize above 100 down to 100', () => {
    expect(parsePagination({ pageSize: '9999' }).pageSize).toBe(100);
  });

  it('treats pageSize=0 as unspecified and falls back to the default', () => {
    // `Number('0') || 20` — 0 is falsy in JS, so it hits the default
    // before the Math.max(1, ...) clamp ever sees it.
    expect(parsePagination({ pageSize: '0' }).pageSize).toBe(20);
  });

  it('clamps a negative pageSize up to 1', () => {
    expect(parsePagination({ pageSize: '-5' }).pageSize).toBe(1);
  });

  it('falls back to defaults for non-numeric input', () => {
    expect(parsePagination({ page: 'not-a-number' }).page).toBe(1);
  });
});

describe('buildPaginatedResult', () => {
  it('computes totalPages correctly', () => {
    const result = buildPaginatedResult([1, 2, 3], 45, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(3);
  });

  it('rounds totalPages up for a partial last page', () => {
    const result = buildPaginatedResult([], 21, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(2);
  });

  it('reports 0 totalPages for an empty result set', () => {
    const result = buildPaginatedResult([], 0, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(0);
  });
});

describe('toPrismaSkipTake', () => {
  it('computes skip=0 for page 1', () => {
    expect(toPrismaSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('computes skip correctly for later pages', () => {
    expect(toPrismaSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
});
