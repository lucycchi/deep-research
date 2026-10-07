import { z } from 'zod';

import { systemPrompt } from '../prompt';
import { generateResearchObject, researchProvider } from './research-model';

export function searchProvider(): 'agent' | 'firecrawl' {
  const provider =
    process.env.SEARCH_PROVIDER ??
    (researchProvider() === 'api' ? 'firecrawl' : 'agent');
  if (provider !== 'agent' && provider !== 'firecrawl')
    throw new Error('SEARCH_PROVIDER must be agent or firecrawl');
  if (provider === 'agent' && researchProvider() === 'api')
    throw new Error('SEARCH_PROVIDER=agent requires codex or claude-code');
  return provider;
}

export async function researchWeb(
  query: string,
  researchGoal: string,
  numFollowUpQuestions: number,
) {
  const result = await generateResearchObject({
    system: systemPrompt(),
    webResearch: true,
    prompt: `Research this query using live web tools: ${query}\nGoal: ${researchGoal}\nFind up to five relevant sources, preferring primary sources. Return up to three detailed, concise findings, each linked to the exact source URL supporting it. Include entities, metrics, and dates where supported. Distinguish inference and uncertainty. Return up to ${numFollowUpQuestions} follow-up research questions. Do not claim sources were read if they were not available.`,
    schema: z.object({
      findings: z
        .array(
          z.object({
            learning: z.string().min(1),
            sourceUrl: z.string().url(),
          }),
        )
        .min(1),
      followUpQuestions: z.array(z.string()),
    }),
  });
  for (const finding of result.object.findings) {
    if (!/^https?:\/\//i.test(finding.sourceUrl))
      throw new Error('Research sources must use HTTP or HTTPS');
  }
  return {
    learnings: result.object.findings
      .slice(0, 3)
      .map(finding => `${finding.learning} [Source: ${finding.sourceUrl}]`),
    visitedUrls: [
      ...new Set(
        result.object.findings.slice(0, 3).map(finding => finding.sourceUrl),
      ),
    ],
    followUpQuestions: result.object.followUpQuestions.slice(
      0,
      numFollowUpQuestions,
    ),
  };
}
