import { describe, expect, it } from 'vitest';

import { mimeMatchesContent, parseClamResponse } from './file-scan.js';

describe('file scan validation', () => {
  it('accepts only recognized ClamAV outcomes', () => {
    expect(parseClamResponse('stream: OK')).toBe('clean');
    expect(parseClamResponse('stream: Eicar-Test-Signature FOUND')).toBe('infected');
    expect(() => parseClamResponse('stream: ERROR')).toThrow();
  });

  it('matches binary MIME exactly and validates text content', () => {
    expect(mimeMatchesContent('application/pdf', 'application/pdf', Buffer.from('%PDF'))).toBe(
      true,
    );
    expect(mimeMatchesContent('application/pdf', 'image/png', Buffer.from('png'))).toBe(false);
    expect(mimeMatchesContent('text/plain', undefined, Buffer.from('safe utf-8 text'))).toBe(true);
    expect(mimeMatchesContent('text/plain', undefined, Buffer.from([0, 1, 2]))).toBe(false);
  });
});
