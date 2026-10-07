import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Codex } from '@openai/codex-sdk';
import { z } from 'zod';

import { deepResearch, writeFinalReport } from '../deep-research';
import { claudeCli, claudeEnvironment, parseClaudeResult } from './claude-code';
import { generateResearchObject } from './research-model';
import { researchWeb, searchProvider } from './web-research';

test('Claude CLI uses only subscription auth and the permitted web tools', async () => {
  const saved = { ...process.env };
  try {
    process.env.RESEARCH_PROVIDER = 'claude-code';
    process.env.ANTHROPIC_API_KEY = 'secret';
    process.env.ANTHROPIC_AUTH_TOKEN = 'secret';
    process.env.CLAUDE_CODE_USE_BEDROCK = '1';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'secret';
    const env = claudeEnvironment();
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_OAUTH_TOKEN',
    ])
      assert.equal(env[name], undefined);
    let loggedIn = true;
    let web = false;
    let requests = 0;
    mock.method(
      claudeCli,
      'run',
      async (
        args: string[],
        input: string,
        childEnv: Record<string, string>,
      ) => {
        assert.equal(childEnv.ANTHROPIC_API_KEY, undefined);
        if (args[0] === 'auth')
          return JSON.stringify({
            loggedIn,
            authMethod: loggedIn ? 'claude.ai' : 'none',
            apiProvider: 'firstParty',
            subscriptionType: 'max',
          });
        requests++;
        assert.ok(args.includes('--safe-mode'));
        assert.ok(args.includes('--restricted'));
        assert.ok(args.includes('--strict-mcp-config'));
        assert.equal(
          JSON.parse(args[args.indexOf('--json-schema') + 1]!).$schema,
          undefined,
        );
        assert.ok(!args.includes('--bare'));
        assert.equal(
          args[args.indexOf('--tools') + 1],
          web ? 'WebSearch,WebFetch' : '',
        );
        assert.equal(
          JSON.parse(args[args.indexOf('--settings') + 1]!).forceLoginMethod,
          'claudeai',
        );
        assert.ok(input.includes('Do not run commands'));
        return JSON.stringify({
          subtype: 'success',
          structured_output: { status: 'ok' },
        });
      },
    );
    const request = {
      system: 'Research',
      prompt: 'Return ok',
      schema: z.object({ status: z.literal('ok') }),
    };
    assert.deepEqual((await generateResearchObject(request)).object, {
      status: 'ok',
    });
    web = true;
    await generateResearchObject({ ...request, webResearch: true });
    loggedIn = false;
    await assert.rejects(generateResearchObject(request), /No API fallback/);
    assert.equal(requests, 2);
    assert.throws(
      () => parseClaudeResult('{"subtype":"error_max_turns"}'),
      /failed/,
    );
    assert.throws(
      () =>
        parseClaudeResult('{"subtype":"success","permission_denials":[{}]}'),
      /web tool/,
    );
    assert.throws(
      () => parseClaudeResult('{"subtype":"success"}'),
      /structured output/,
    );
  } finally {
    mock.restoreAll();
    process.env = saved;
  }
});

test('agent research runs recursively without Firecrawl and retains source links in the report', async () => {
  const saved = { ...process.env };
  try {
    process.env.RESEARCH_PROVIDER = 'codex';
    delete process.env.SEARCH_PROVIDER;
    delete process.env.FIRECRAWL_KEY;
    assert.equal(searchProvider(), 'agent');
    let searches = 0;
    let source = 'https://example.com/evidence';
    mock.method(Codex.prototype, 'startThread', (options: any) => ({
      run: async (prompt: string, turn: any) => {
        const properties = turn.outputSchema.properties;
        let object: unknown;
        if (properties.queries)
          object = {
            queries: [{ query: 'Evidence', researchGoal: 'Verify evidence' }],
          };
        else if (properties.findings) {
          assert.equal(
            properties.findings.items.properties.sourceUrl.format,
            undefined,
          );
          searches++;
          assert.equal(options.webSearchMode, 'live');
          object = {
            findings: [{ learning: 'A supported finding.', sourceUrl: source }],
            followUpQuestions: ['Check another source'],
          };
        } else {
          assert.ok(prompt.includes('[Source: https://example.com/evidence]'));
          object = {
            reportMarkdown:
              'A report with [evidence](https://example.com/evidence).',
          };
        }
        return {
          finalResponse: JSON.stringify(object),
          items:
            options.webSearchMode === 'live' ? [{ type: 'web_search' }] : [],
        };
      },
    }));
    const result = await deepResearch({
      query: 'A topic',
      breadth: 1,
      depth: 2,
    });
    assert.equal(searches, 2);
    assert.deepEqual(result.visitedUrls, ['https://example.com/evidence']);
    assert.equal(result.learnings.length, 1);
    const report = await writeFinalReport({ prompt: 'A topic', ...result });
    assert.ok(report.includes('## Sources\n\n- https://example.com/evidence'));
    source = 'file:///private.txt';
    await assert.rejects(researchWeb('Query', 'Goal', 1), /HTTP or HTTPS/);
    process.env.RESEARCH_PROVIDER = 'api';
    assert.equal(searchProvider(), 'firecrawl');
    process.env.SEARCH_PROVIDER = 'agent';
    assert.throws(searchProvider, /requires codex or claude-code/);
  } finally {
    mock.restoreAll();
    process.env = saved;
  }
});
