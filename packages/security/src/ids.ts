import { randomBytes } from 'node:crypto';
import { PUBLIC_REF_ENTROPY_BYTES } from '@pcs/config';
import { REFERENCE_PREFIXES, type ReferenceKind } from '@pcs/types';

/**
 * UUID v7 for internal primary keys — time-sortable, index-friendly
 * (Technology Architecture §113). Internal identity, never exposed publicly.
 */
export function uuidv7(): string {
  const buf = randomBytes(16);
  const ts = Date.now();
  buf.writeUIntBE(ts, 0, 6); // 48-bit big-endian millisecond timestamp
  buf[6] = (buf[6]! & 0x0f) | 0x70; // version 7
  buf[8] = (buf[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Opaque, non-sequential public reference (Data & State Model §5, §113;
 * Threat Model TH-009/TH-039/TH-040). Prefixed per entity kind; the body is
 * high-entropy and URL-safe. Never a database primary key.
 */
export function generatePublicRef(
  kind: ReferenceKind,
  entropyBytes = PUBLIC_REF_ENTROPY_BYTES,
): string {
  const prefix = REFERENCE_PREFIXES[kind];
  const body = randomBytes(entropyBytes).toString('base64url');
  return `${prefix}_${body}`;
}

/** Parse a public reference, returning its kind if the prefix is recognized. */
export function referenceKindOf(ref: string): ReferenceKind | null {
  const [prefix] = ref.split('_', 1);
  const entry = (Object.entries(REFERENCE_PREFIXES) as [ReferenceKind, string][]).find(
    ([, p]) => p === prefix,
  );
  return entry ? entry[0] : null;
}
