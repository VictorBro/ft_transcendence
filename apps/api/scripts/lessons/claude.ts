/**
 * Runs Claude Code headless (`claude -p`) on the member's own
 * subscription: no API key, the login of their Claude Code.
 *
 * Every call is cut off from the repo and the member's setup: no tools,
 * no MCP servers, no settings, no CLAUDE.md, and our own system prompt in
 * place of Claude Code's. It runs in a folder of its own, so the
 * sessions it saves stay out of the member's session list.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const WORK_DIR = join(tmpdir(), 'ft-lessons-author');

/**
 * The claude binary: CLAUDE_BIN, else `claude` on the PATH, else the one
 * the VS Code extension ships (a dev container often has only that one).
 */
export function findClaude(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  for (const dir of (process.env.PATH ?? '').split(':'))
    if (dir && existsSync(join(dir, 'claude'))) return join(dir, 'claude');
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
  throw new Error('claude not found: install Claude Code, or set CLAUDE_BIN to its binary');
}

export interface ClaudeOptions {
  bin: string;
  model: string;
  effort?: string;
  /** The file holding the system prompt. */
  systemPromptFile: string;
  /** Continues this conversation instead of starting one. */
  resume?: string;
  timeoutMs: number;
}

export interface ClaudeReply {
  text: string;
  sessionId: string;
  durationMs: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** What the call would cost on the API. Not billed on a subscription: a measure of size only. */
  costUsd: number;
}

/** The subscription's usage limit, or any refusal that the next lesson would hit too. */
export class QuotaError extends Error {}

export function writeSystemPrompt(name: string, text: string): string {
  mkdirSync(WORK_DIR, { recursive: true });
  const path = join(WORK_DIR, `${name}.system.md`);
  writeFileSync(path, text);
  return path;
}

export function askClaude(prompt: string, o: ClaudeOptions): Promise<ClaudeReply> {
  const args = [
    '-p',
    '--output-format',
    'json',
    '--model',
    o.model,
    '--system-prompt-file',
    o.systemPromptFile,
    '--tools',
    '',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    ...(o.effort ? ['--effort', o.effort] : []),
    ...(o.resume ? ['--resume', o.resume] : []),
  ];
  mkdirSync(WORK_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    const child = spawn(o.bin, args, { cwd: WORK_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`claude took more than ${Math.round(o.timeoutMs / 60000)} min`));
    }, o.timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let out;
      try {
        out = JSON.parse(stdout);
      } catch {
        const text = `${stdout}\n${stderr}`.trim().slice(0, 500);
        reject(
          /limit|quota/i.test(text)
            ? new QuotaError(text)
            : new Error(`claude exited ${code}: ${text}`),
        );
        return;
      }
      if (out.is_error) {
        const text = String(out.result ?? out.subtype ?? 'error');
        const quota =
          out.api_error_status === 429 || /usage limit|rate limit|limit reached|quota/i.test(text);
        reject(quota ? new QuotaError(text) : new Error(`claude: ${text.slice(0, 500)}`));
        return;
      }
      const u = out.usage ?? {};
      resolve({
        text: String(out.result ?? ''),
        sessionId: out.session_id,
        durationMs: out.duration_ms ?? 0,
        inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        cachedTokens: u.cache_read_input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        costUsd: out.total_cost_usd ?? 0,
      });
    });
    child.stdin.end(prompt);
  });
}

/** The JSON object of a reply, even when Claude wrapped it in a fence or a sentence. */
export function parseReply(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(text.slice(start, end + 1));
}
