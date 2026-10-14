import { describe, expect, it } from 'vitest';
import { parseContactsCsv } from '../../src/worker/csv';

describe('parseContactsCsv', () => {
  it('handles an O365 export with a BOM, semicolons, whitespace, duplicates and bad rows', () => {
    const csv = '﻿Display name;Email\nAnn;ANN@x.com\nBob; bob@x.com \nBad;not-an-email\nAnn again;ann@x.com\n';
    const r = parseContactsCsv(csv);
    expect(r.rows).toEqual([
      { email: 'ann@x.com', name: 'Ann' },
      { email: 'bob@x.com', name: 'Bob' },
    ]);
    expect(r.invalid).toEqual([{ line: 4, value: 'not-an-email' }]);
    expect(r.duplicatesInFile).toBe(1);
    expect(r.mapping).toEqual({ email: 'Email', name: 'Display name' });
  });

  it('recognises PrimarySmtpAddress and DisplayName', () => {
    expect(parseContactsCsv('PrimarySmtpAddress,DisplayName\na@x.com,A\n').rows[0]).toEqual({ email: 'a@x.com', name: 'A' });
  });

  it('joins first and last names', () => {
    expect(parseContactsCsv('First name,Last name,Mail\nAnn,Lee,a@x.com\n').rows[0].name).toBe('Ann Lee');
  });

  it('keeps quoted names with commas and apostrophes', () => {
    expect(parseContactsCsv('Name,Email\n"Smith, Ann",a@x.com\nO\'Brien,b@x.com\n').rows.map((r) => r.name)).toEqual(['Smith, Ann', "O'Brien"]);
  });

  it('returns a null mapping when no email column is found', () => {
    const r = parseContactsCsv('foo,bar\n1,2\n');
    expect(r.mapping).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.columns).toEqual(['foo', 'bar']);
  });

  it('uses an explicit mapping', () => {
    const r = parseContactsCsv('foo,bar\nAnn,a@x.com\n', { email: 'bar', name: 'foo' });
    expect(r.rows).toEqual([{ email: 'a@x.com', name: 'Ann' }]);
  });

  it('skips blank lines', () => {
    expect(parseContactsCsv('Email\n\na@x.com\n\n').rows).toHaveLength(1);
  });
});
