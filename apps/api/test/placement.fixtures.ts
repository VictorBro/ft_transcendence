import { randomUUID } from 'node:crypto';
import { LEVELS, QUESTION_CATEGORIES } from '@ft/shared';

import type { QuestionBank } from '../src/generated/prisma/client';
import type { ExamSession } from '../src/placement/placement.schema';

/** A run as startPlacement opens it: B1, nothing asked, no question served yet. */
export function examSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    evalId: randomUUID(),
    lang: 'de',
    lo: 0,
    hi: 5,
    level: LEVELS.indexOf('B1'),
    mistakesPerLevel: 0,
    askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
    totalAnswered: 0,
    answers: [],
    ended: false,
    currentQuestionId: null,
    currentOptions: null,
    servedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** A German B1 grammar row, the answer listed first as in the authored items. */
export function questionRow(overrides: Partial<QuestionBank> = {}): QuestionBank {
  const category = overrides.category ?? 'grammar';
  return {
    id: randomUUID(),
    sourceId: null,
    lang: 'de',
    level: 'B1',
    topic: 'verbs_morphology',
    category,
    // PlacementQuestionSchema wants a text on reading rows and refuses one elsewhere.
    readText: category === 'reading' ? 'Er ist gestern ins Kino gegangen.' : null,
    question: 'Er ___ gestern ins Kino gegangen.',
    options: ['ist', 'hat', 'war', 'wird'],
    answer: 'ist',
    timeLimitS: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Three rows for every level and category, one more than a level asks for. */
export function placementBank(lang: QuestionBank['lang'] = 'de'): QuestionBank[] {
  return LEVELS.flatMap((level) =>
    QUESTION_CATEGORIES.flatMap((category) =>
      Array.from({ length: 3 }, () => questionRow({ lang, level, category })),
    ),
  );
}

export function wrongChoice(row: Pick<QuestionBank, 'options' | 'answer'>): string {
  const choice = row.options.find((option) => option !== row.answer);
  if (choice === undefined) throw new Error(`no wrong option in ${row.options.join(', ')}`);
  return choice;
}

type Stored = string | Record<string, string> | string[];

const RELEASE_LOCK_SCRIPT =
  'if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end';

/** The node-redis calls the placement services make, in memory. TTLs are recorded, not enforced. */
export function fakeRedis() {
  const data = new Map<string, Stored>();
  const ttl = new Map<string, number>();
  const client = {
    async set(key: string, value: string, options: { NX?: boolean; EX?: number } = {}) {
      if (options.NX && data.has(key)) return null;
      data.set(key, value);
      if (options.EX) ttl.set(key, options.EX);
      return 'OK';
    },
    // The only script the services run: delete the lock if the token still owns it.
    // It is emulated, not run, so any other script throws rather than pass for it.
    async eval(script: string, { keys, arguments: args }: { keys: string[]; arguments: string[] }) {
      if (script !== RELEASE_LOCK_SCRIPT) throw new Error(`unexpected script: ${script}`);
      if (data.get(keys[0]) !== args[0]) return 0;
      data.delete(keys[0]);
      return 1;
    },
    async exists(key: string) {
      return data.has(key) ? 1 : 0;
    },
    async del(keys: string | string[]) {
      return [keys].flat().filter((key) => data.delete(key)).length;
    },
    async hSet(key: string, fields: Record<string, string | number>) {
      const strings = Object.entries(fields).map(([field, value]) => [field, String(value)]);
      data.set(key, {
        ...(data.get(key) as Record<string, string>),
        ...Object.fromEntries(strings),
      });
      return strings.length;
    },
    async hGetAll(key: string) {
      return (data.get(key) as Record<string, string> | undefined) ?? {};
    },
    async rPush(key: string, value: string) {
      const list = [...((data.get(key) as string[] | undefined) ?? []), value];
      data.set(key, list);
      return list.length;
    },
    // Redis includes the stop index, and -1 is the last one.
    async lRange(key: string, start: number, stop: number) {
      const list = (data.get(key) as string[] | undefined) ?? [];
      return list.slice(start, stop === -1 ? undefined : stop + 1);
    },
    async expire(key: string, seconds: number) {
      ttl.set(key, seconds);
      return 1;
    },
    multi() {
      const queue: (() => Promise<unknown>)[] = [];
      const queued =
        <A extends unknown[]>(command: (...args: A) => Promise<unknown>) =>
        (...args: A) => {
          queue.push(() => command(...args));
          return tx;
        };
      const tx = {
        hSet: queued(client.hSet),
        hGetAll: queued(client.hGetAll),
        lRange: queued(client.lRange),
        rPush: queued(client.rPush),
        del: queued(client.del),
        expire: queued(client.expire),
        async exec() {
          const replies = [];
          for (const command of queue) replies.push(await command());
          return replies;
        },
      };
      return tx;
    },
  };
  return { client, data, ttl };
}

type BankWhere = Partial<Record<'lang' | 'level' | 'category', string>> & {
  id?: { in: string[] };
  userSeenQuestions?: { none: { userId: string } };
};

/** The QuestionBank and UserSeenQuestion calls the placement services make, answered from `rows`. */
export function bankPrisma(rows: QuestionBank[]) {
  const seen = new Set<string>();
  const matches = (row: QuestionBank, { id, userSeenQuestions, ...fields }: BankWhere) =>
    (!id || id.in.includes(row.id)) &&
    (!userSeenQuestions || !seen.has(`${userSeenQuestions.none.userId}:${row.id}`)) &&
    Object.entries(fields).every(([field, value]) => row[field as keyof QuestionBank] === value);
  return {
    questionBank: {
      findUnique: async ({ where }: { where: { id: string | null } }) => {
        // Prisma refuses a null id rather than finding nothing.
        if (where.id === null) throw new Error('Argument `id` must not be null.');
        return rows.find((row) => row.id === where.id) ?? null;
      },
      findMany: async ({ where, take }: { where: BankWhere; take?: number }) =>
        rows.filter((row) => matches(row, where)).slice(0, take),
    },
    userSeenQuestion: {
      upsert: async ({ create }: { create: { userId: string; questionId: string } }) =>
        seen.add(`${create.userId}:${create.questionId}`),
      // A bank from placementBank never runs out of unseen rows, so no fallback draw.
      findMany: async () => [],
    },
  };
}
