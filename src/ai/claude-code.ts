import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Kept separate so tests can exercise CLI failures without consuming subscription usage.
export const claudeCli = {
  run(
    args: string[],
    input: string,
    env: Record<string, string>,
    cwd: string,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.env.CLAUDE_PATH || 'claude', args, {
        env,
        cwd,
        signal,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.length > 10_000_000) {
          child.kill();
          reject(new Error('Claude Code output exceeded 10 MB'));
        }
      });
      child.stderr.on('data', chunk => {
        stderr = (stderr + chunk.toString()).slice(-8000);
      });
      child.on('close', code => {
        if (code !== 0)
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.end(input);
    });
  },
};

export function claudeEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      !/^(ANTHROPIC|CLAUDE_CODE|CLAUDE_CONFIG_DIR|CLAUDECODE|OPENAI|CODEX_API_KEY|FIREWORKS|FIRECRAWL)/i.test(
        key,
      )
    )
      env[key] = value;
  }
  return env;
}

export function parseClaudeResult(text: string): unknown {
  const result = JSON.parse(text);
  if (result.is_error || result.subtype !== 'success') {
    throw new Error(
      `Claude Code failed: ${result.result || result.errors?.join('; ') || result.subtype}`,
    );
  }
  if (result.permission_denials?.length)
    throw new Error('Claude Code could not access a required web tool');
  if (result.structured_output === undefined)
    throw new Error('Claude Code returned no structured output');
  return result.structured_output;
}

export async function runClaudeCode(
  prompt: string,
  outputSchema: unknown,
  webResearch: boolean,
  signal: AbortSignal,
): Promise<unknown> {
  const cwd = await mkdtemp(join(tmpdir(), 'deep-research-claude-'));
  try {
    const env = claudeEnvironment();
    const auth = JSON.parse(
      await claudeCli.run(['auth', 'status', '--json'], '', env, cwd, signal),
    );
    if (
      !auth.loggedIn ||
      !['claude.ai', 'oauth'].includes(auth.authMethod) ||
      auth.apiProvider !== 'firstParty' ||
      !auth.subscriptionType
    ) {
      throw new Error(
        'Claude Code requires a Claude subscription login. Run claude auth login; API and cloud-provider authentication are not accepted.',
      );
    }
    const tools = webResearch ? 'WebSearch,WebFetch' : '';
    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(outputSchema),
      '--safe-mode',
      '--restricted',
      '--strict-mcp-config',
      '--settings',
      JSON.stringify({ forceLoginMethod: 'claudeai', disableAllHooks: true }),
      '--tools',
      tools,
      '--allowedTools',
      tools,
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--disable-slash-commands',
      '--no-chrome',
    ];
    if (process.env.CLAUDE_MODEL)
      args.push('--model', process.env.CLAUDE_MODEL);
    return parseClaudeResult(
      await claudeCli.run(args, prompt, env, cwd, signal),
    );
  } finally {
    try {
      await rm(cwd, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    } catch {
      // Windows can briefly retain a handle after the CLI exits. Cleanup must
      // not discard a successful response or mask the original request error.
      process.emitWarning(
        `Could not clean up the temporary Claude directory: ${cwd}`,
      );
    }
  }
}
