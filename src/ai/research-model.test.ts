import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Codex } from '@openai/codex-sdk';
import { z } from 'zod';

import {
  codexOptions,
  generateResearchObject,
  usesCodex,
} from './research-model';

test('subscription adapter enforces auth, validates output, serializes calls and never falls back', async () => {
  const saved = { ...process.env };
  try {
    delete process.env.RESEARCH_PROVIDER;
    assert.equal(usesCodex(), true);
    process.env.OPENAI_API_KEY = 'test-secret';
    process.env.CODEX_API_KEY = 'test-secret';
    process.env.CODEX_ACCESS_TOKEN = 'test-secret';
    process.env.FIRECRAWL_KEY = 'test-secret';
    const options = codexOptions();
    assert.equal(options.config?.forced_login_method, 'chatgpt');
    assert.equal(options.config?.model_provider, 'openai');
    assert.equal(options.env?.OPENAI_API_KEY, undefined);
    assert.equal(options.env?.CODEX_API_KEY, undefined);
    assert.equal(options.env?.CODEX_ACCESS_TOKEN, undefined);
    assert.equal(options.env?.FIRECRAWL_KEY, undefined);
    let active = 0;
    let maximum = 0;
    let response = '{"questions":["Why?"]}';
    let searched = false;
    let webMode = 'disabled';
    mock.method(Codex.prototype, 'startThread', (threadOptions: any) => {
      assert.equal(threadOptions.sandboxMode, 'read-only');
      assert.equal(threadOptions.approvalPolicy, 'never');
      assert.equal(threadOptions.webSearchMode, webMode);
      return {
        run: async (_prompt: string, turnOptions: any) => {
          assert.equal(turnOptions.outputSchema.additionalProperties, false);
          assert.ok(turnOptions.signal instanceof AbortSignal);
          active++;
          maximum = Math.max(maximum, active);
          await new Promise(resolve => setTimeout(resolve, 5));
          active--;
          return {
            finalResponse: response,
            items: searched ? [{ type: 'web_search' }] : [],
          };
        },
      };
    });
    const request = {
      system: 'Research',
      prompt: 'A topic',
      schema: z.object({ questions: z.array(z.string()) }),
    };
    const results = await Promise.all([
      generateResearchObject(request),
      generateResearchObject(request),
    ]);
    assert.equal(maximum, 1);
    assert.deepEqual(results[0]?.object, { questions: ['Why?'] });
    webMode = 'live';
    await assert.rejects(
      generateResearchObject({ ...request, webResearch: true }),
      /No API fallback/,
    );
    searched = true;
    assert.deepEqual(
      (await generateResearchObject({ ...request, webResearch: true })).object,
      { questions: ['Why?'] },
    );
    webMode = 'disabled';
    response = '{"questions":42}';
    await assert.rejects(generateResearchObject(request), /No API fallback/);
    response = 'not JSON';
    await assert.rejects(generateResearchObject(request), /No API fallback/);
    process.env.RESEARCH_PROVIDER = 'invalid';
    assert.throws(usesCodex, /RESEARCH_PROVIDER/);
    process.env.RESEARCH_PROVIDER = 'api';
    assert.equal(usesCodex(), false);
  } finally {
    mock.restoreAll();
    process.env = saved;
  }
});
