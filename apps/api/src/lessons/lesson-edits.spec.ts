import { describe, expect, it } from 'vitest';

import { applyEdits } from '../../scripts/lessons/edits';
import {
  QuotaError,
  RateLimitError,
  refusal,
  retryRateLimits,
} from '../../scripts/lessons/providers/chat';
import { applyReply, parseReply } from '../../scripts/lessons/reply';

/**
 * How the authoring kit (#83) reads a model's reply: the JSON object in
 * it (scripts/lessons/reply.ts), and the edits it asks for
 * (scripts/lessons/edits.ts), whose paths all refer to the draft as the
 * model saw it, and how a refusal from the model is handled (providers/chat.ts).
 */

describe('applyEdits', () => {
  it('sets and deletes at dotted paths, and reports a path that does not exist', () => {
    const draft = { brief: { targets: [{ id: 'a' }, { id: 'b' }] }, content: { steps: [1, 2, 3] } };
    const problems = applyEdits(draft, [
      { file: 'brief', path: 'targets.1.id', value: 'c' },
      { file: 'content', path: 'steps.0', delete: true },
      { file: 'brief', path: 'nothing.here.at.all', value: 1 },
    ]);
    expect(draft).toEqual({
      brief: { targets: [{ id: 'a' }, { id: 'c' }] },
      content: { steps: [2, 3] },
    });
    expect(problems).toEqual(['brief.nothing.here.at.all: the path does not exist']);
  });

  it('deletes the items the model named, whatever their order in the reply', () => {
    const draft = { brief: { a: ['w', 'x', 'y', 'z'] } };
    const problems = applyEdits(draft, [
      { file: 'brief', path: 'a.1', delete: true },
      { file: 'brief', path: 'a.3', delete: true },
      { file: 'brief', path: 'a.1', delete: true }, // the same delete twice counts once
    ]);
    expect(problems).toEqual([]);
    expect(draft.brief.a).toEqual(['w', 'y']);
  });

  it('deletes inside an item and the item before it, both as the model saw them', () => {
    const draft = { content: { steps: [{ pages: [1] }, { pages: [2, 3] }] } };
    applyEdits(draft, [
      { file: 'content', path: 'steps.0', delete: true },
      { file: 'content', path: 'steps.1.pages.0', delete: true },
    ]);
    expect(draft.content.steps).toEqual([{ pages: [3] }]);
  });

  it('refuses what is not an index of a list, instead of deleting the first item', () => {
    const draft = { brief: { a: ['x', 'y'] } };
    const problems = applyEdits(draft, [
      { file: 'brief', path: 'a.first', delete: true },
      { file: 'brief', path: 'a.-1', delete: true },
      { file: 'brief', path: 'a.2', delete: true },
      { file: 'brief', path: 'a.5', value: 'z' },
    ]);
    expect(draft.brief.a).toEqual(['x', 'y']);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toBe(
      'brief.a.first: first is not an index of this list, which has 2 items',
    );
  });

  it('appends at the end of a list, accepts the issue prefix, and refuses __proto__', () => {
    const draft = { brief: { a: ['x'] } };
    const problems = applyEdits(draft, [
      { file: 'brief', path: 'brief.a.1', value: 'y' },
      { file: 'brief', path: '__proto__.polluted', value: true },
      { file: 'content', path: 'steps.0', value: 1 },
    ]);
    expect(draft.brief.a).toEqual(['x', 'y']);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(problems).toEqual([
      'brief.__proto__.polluted: not an allowed key',
      'content.steps.0: no such file',
    ]);
  });
});

describe('parseReply', () => {
  it('reads the first object, in a code fence or followed by another one', () => {
    expect(parseReply('```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: '}' } });
    expect(parseReply('{"a":1}{"a":1}')).toEqual({ a: 1 });
    expect(parseReply('{"a":"say \\"{hi\\""}')).toEqual({ a: 'say "{hi"' });
  });

  it('says when there is no object, or when it was cut off', () => {
    expect(() => parseReply('no json')).toThrow('no JSON object');
    expect(() => parseReply('{"a":[1,')).toThrow('cut off');
  });
});

describe('applyReply', () => {
  it('takes a whole lesson, a bare brief, or edits', () => {
    const draft: { brief: unknown; content?: unknown } = { brief: {} };
    expect(applyReply(draft, '{"brief":{"t":1},"content":{"s":2}}')).toEqual({ editProblems: [] });
    expect(draft).toEqual({ brief: { t: 1 }, content: { s: 2 } });
    applyReply(draft, '{"t":3}');
    expect(draft.brief).toEqual({ t: 3 });
    applyReply(draft, '{"edits":[{"file":"content","path":"s","value":4}]}');
    expect(draft.content).toEqual({ s: 4 });
    expect(applyReply(draft, 'sorry')).toEqual({
      error: 'your reply is not one JSON object: no JSON object in the reply',
    });
  });
});

describe('refusal', () => {
  it('stops the run on the usage limit, retries a rate limit, and ignores any other error', () => {
    expect(refusal(undefined, "You've hit your usage limit")).toBeInstanceOf(QuotaError);
    expect(refusal(429, 'slow down')).toBeInstanceOf(RateLimitError);
    expect(refusal(undefined, 'Rate limit exceeded')).toBeInstanceOf(RateLimitError);
    expect(refusal(429, 'API Error: Rate limit reached')).toBeInstanceOf(RateLimitError);
    expect(refusal(500, 'heap limit exceeded')).toBeUndefined();
  });
});

describe('retryRateLimits', () => {
  it('retries a call while it is rate limited, and returns its answer', async () => {
    let calls = 0;
    const call = async () => {
      if (++calls < 3) throw new RateLimitError('rate limit');
      return 'ok';
    };
    await expect(retryRateLimits(call, [0, 0, 0])).resolves.toBe('ok');
    expect(calls).toBe(3);
  });

  it('turns a rate limit that outlasts the retries into a QuotaError', async () => {
    let calls = 0;
    const call = async () => {
      calls++;
      throw new RateLimitError('rate limit');
    };
    await expect(retryRateLimits(call, [0, 0])).rejects.toBeInstanceOf(QuotaError);
    expect(calls).toBe(3);
  });

  it('does not retry any other error', async () => {
    let calls = 0;
    const call = async () => {
      calls++;
      throw new Error('crash');
    };
    await expect(retryRateLimits(call, [0, 0])).rejects.toThrow('crash');
    expect(calls).toBe(1);
  });
});
