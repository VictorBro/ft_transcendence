/**
 * Claude Code headless (`claude -p`), on the member's own subscription: no
 * API key, the login of their Claude Code.
 *
 * Every call is cut off from the repo and the member's setup: no tools, no
 * MCP servers, no settings, no CLAUDE.md, and our system prompt in place of
 * Claude Code's. It runs in WORK_DIR, so the sessions it saves stay out of
 * the member's session list. A lesson's later prompts resume its session.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { LESSON_KINDS, type LessonKind } from '@ft/shared';

import { WORK_DIR, writeWork } from '../files';
import type { Json } from '../json';
import { systemPrompt } from '../prompt';
import { QUOTA_MESSAGE, QuotaError, type Chat, type Provider, type Reply } from './chat';

/** How long a killed claude gets to exit before SIGKILL. */
const KILL_GRACE_MS = 5_000;

export interface ClaudeOptions {
  /** sonnet, opus, haiku, or a full model id. */
  model: string;
  /** low to max; the model's own default when left out. */
  effort?: string;
  /** --claude-bin; found by findClaude() when left out. */
  bin?: string;
  timeoutMs: number;
}

/**
 * The claude binary: `claude` when it runs from the PATH, else the one the
 * VS Code extension ships (a dev container often has only that one).
 */
export function findClaude(): string {
  if (spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0) return 'claude';
  for (const root of ['.vscode-server/extensions', '.vscode/extensions']) {
    const dir = join(homedir(), root);
    if (!existsSync(dir)) continue;
    const latest = readdirSync(dir)
      .filter((d) => d.startsWith('anthropic.claude-code-'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .pop();
    const bin = latest && join(dir, latest, 'resources/native-binary/claude');
    if (bin && existsSync(bin)) return bin;
  }
  throw new Error('claude not found: install Claude Code, or pass --claude-bin <path>');
}

/**
 * Runs claude once with `prompt` on stdin and returns its JSON output.
 * Rejects with QuotaError on a usage refusal, with Error on anything else
 * (a crash, a timeout, an error reply).
 */
function runClaude(bin: string, args: string[], prompt: string, timeoutMs: number): Promise<Json> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: WORK_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    // SIGTERM first; SIGKILL if claude ignores it, so a hung process never outlives the run.
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
      settle(() =>
        reject(new Error(`claude took more than ${Math.round(timeoutMs / 60_000)} min`)),
      );
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => settle(() => reject(e)));
    child.on('close', (code) =>
      settle(() => {
        let out: Json;
        try {
          out = JSON.parse(stdout);
        } catch {
          const text = `${stdout}\n${stderr}`.trim().slice(0, 500);
          reject(
            QUOTA_MESSAGE.test(text)
              ? new QuotaError(text)
              : new Error(`claude exited ${code}: ${text}`),
          );
          return;
        }
        if (!out.is_error) return resolve(out);
        const text = String(out.result ?? out.subtype ?? 'error');
        const quota = out.api_error_status === 429 || QUOTA_MESSAGE.test(text);
        reject(quota ? new QuotaError(text) : new Error(`claude: ${text.slice(0, 500)}`));
      }),
    );
    child.stdin.end(prompt);
  });
}

/** The reply and its usage, from claude's JSON output. */
function toReply(out: Json): Reply {
  const u = out.usage ?? {};
  return {
    text: String(out.result ?? ''),
    inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    cachedTokens: u.cache_read_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    costUsd: out.total_cost_usd ?? 0,
  };
}

export function claudeProvider(o: ClaudeOptions): Provider {
  const bin = o.bin ?? findClaude();
  // One system prompt file per kind, the same for every lesson: Claude Code caches it.
  const promptFiles = new Map(
    LESSON_KINDS.map((k) => [k, writeWork(`${k}.system.md`, systemPrompt(k))]),
  );
  const baseArgs = [
    ...['-p', '--output-format', 'json', '--model', o.model],
    ...['--tools', '', '--setting-sources', '', '--strict-mcp-config'],
    ...(o.effort ? ['--effort', o.effort] : []),
  ];

  return {
    name: 'claude',
    model: o.model,
    billed: false,
    where: `claude: ${bin}`,
    startChat(kind: LessonKind): Chat {
      let session: string | undefined;
      return {
        async send(prompt) {
          const args = [
            ...baseArgs,
            ...['--system-prompt-file', promptFiles.get(kind)!],
            ...(session ? ['--resume', session] : []),
          ];
          const out = await runClaude(bin, args, prompt, o.timeoutMs);
          session = out.session_id;
          return toReply(out);
        },
      };
    },
  };
}
