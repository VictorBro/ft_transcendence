/**
 * Small helpers for the untyped JSON a model writes (#83). Drafts have not
 * passed a schema yet, so the authoring kit reads them as `Json` (any) and
 * checks each part before using it.
 */
import { createHash } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

/** True for a plain object: not null, not an array. */
export const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Sorted keys, no whitespace: the same value always gives the same text.
 *
 *   canonicalJson({ b: 1, a: [2] })  →  '{"a":[2],"b":1}'
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** The sha256 of a value's canonical JSON, in hex: what provenance.inputHashes holds. */
export const sha256 = (value: unknown) =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');
