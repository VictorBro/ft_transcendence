/**
 * Edits (#83): instead of resending a whole lesson to fix three issues, the
 * model can send only the changes, at the paths the issues named:
 *
 *   {"edits":[{"file":"brief","path":"targets.3.examForms","value":["un livre"]},
 *             {"file":"content","path":"steps.2.pages.0.items.1","delete":true}]}
 *
 * Every path refers to the draft as the model saw it, in the issue list.
 * So the sets are applied first, in order, and the deletes last, from the
 * highest index down: deleting items 1 and 3 of a list removes those two,
 * not 1 and then what was 4. Anything that cannot apply is reported back to
 * the model, never guessed: an index out of range, a key that is not an
 * index on a list, a path that does not exist.
 */
import { isObject, type Json } from './json';

export interface Edit {
  file: 'brief' | 'content';
  /** Dot-separated, numbers are list indices; the "brief." or "content." prefix may stay. */
  path: string;
  value?: Json;
  delete?: boolean;
}

/** Where an edit lands: the object or list that holds the key. */
interface Target {
  parent: Json;
  key: string;
  label: string;
}

/** Keys no edit may use: they would reach the prototype of every object. */
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * The keys of an edit's path, its file prefix dropped, since the issues
 * carry it: ("brief", "brief.targets.3") → ["targets", "3"].
 */
function keysOf(edit: Edit): string[] {
  const path = String(edit.path ?? '');
  const prefix = `${edit.file}.`;
  const bare = path === edit.file ? '' : path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return bare.split('.').filter(Boolean);
}

/**
 * `key` as an index of `list`, or undefined when it is not one. A set may
 * also write one past the end (appending); a delete may not.
 */
function indexIn(list: Json[], key: string, allowEnd: boolean): number | undefined {
  if (!/^\d+$/.test(key)) return undefined;
  const i = Number(key);
  return i < list.length || (allowEnd && i === list.length) ? i : undefined;
}

/** Follows `keys` down from `root`; undefined as soon as one step does not exist. */
function walk(root: Json, keys: string[]): Json {
  let node = root;
  for (const key of keys) {
    if (Array.isArray(node)) {
      const i = indexIn(node, key, false);
      if (i === undefined) return undefined;
      node = node[i];
    } else if (isObject(node) && Object.hasOwn(node, key)) node = node[key];
    else return undefined;
  }
  return node;
}

/** Finds where `edit` lands in `draft`, or says why it cannot land. */
function resolveTarget(draft: { brief?: Json; content?: Json }, edit: Edit): Target | string {
  const keys = keysOf(edit);
  const label = [edit.file, ...keys].join('.');
  const root = edit.file === 'brief' || edit.file === 'content' ? draft[edit.file] : undefined;
  if (!isObject(root)) return `${label}: no such file`;
  if (keys.length === 0) return `${label}: empty path`;
  if (keys.some((k) => UNSAFE.has(k))) return `${label}: not an allowed key`;

  const parent = walk(root, keys.slice(0, -1));
  const key = keys[keys.length - 1];
  if (Array.isArray(parent)) {
    if (indexIn(parent, key, !edit.delete) === undefined)
      return `${label}: ${key} is not an index of this list, which has ${parent.length} items`;
  } else if (!isObject(parent)) return `${label}: the path does not exist`;
  else if (edit.delete && !Object.hasOwn(parent, key)) return `${label}: nothing to delete`;
  return { parent, key, label };
}

/** Applies the edits to `draft` in place; returns one message per edit that could not apply. */
export function applyEdits(draft: { brief?: Json; content?: Json }, edits: Edit[]): string[] {
  const problems: string[] = [];
  const deletes = new Map<string, Target>(); // by label: the same delete twice counts once

  for (const edit of edits) {
    const target = resolveTarget(draft, edit);
    if (typeof target === 'string') problems.push(target);
    else if (edit.delete) deletes.set(target.label, target);
    else target.parent[target.key] = edit.value;
  }

  // Keys first (no order needed), then list items from the highest index down.
  const all = [...deletes.values()];
  for (const t of all.filter((t) => !Array.isArray(t.parent))) delete t.parent[t.key];
  for (const t of all
    .filter((t) => Array.isArray(t.parent))
    .sort((a, b) => Number(b.key) - Number(a.key)))
    t.parent.splice(Number(t.key), 1);
  return problems;
}
