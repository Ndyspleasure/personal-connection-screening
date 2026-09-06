import { describe, expect, it } from 'vitest';
import { hashAccessCode, normalizeAccessCode } from '../access-code-service';

/**
 * Pure unit tests for access-code hashing (no DB). The fingerprint must be
 * deterministic per secret so lookups work, case/whitespace-insensitive so codes
 * are forgiving to type, secret-dependent, and never contain the plaintext.
 */
describe('access code normalization + hashing', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(normalizeAccessCode('  abc-123 ')).toBe('ABC-123');
    expect(normalizeAccessCode('AbC')).toBe('ABC');
  });

  it('hash is stable across case/whitespace variants of the same code', () => {
    expect(hashAccessCode('abc123', 's1')).toBe(hashAccessCode('  ABC123 ', 's1'));
  });

  it('hash is secret-dependent and never leaks the plaintext', () => {
    expect(hashAccessCode('abc123', 's1')).not.toBe(hashAccessCode('abc123', 's2'));
    const h = hashAccessCode('abc123', 's1');
    expect(h).not.toContain('abc123');
    expect(h).not.toContain('ABC123');
  });
});
