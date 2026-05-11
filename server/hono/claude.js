import Anthropic from '@anthropic-ai/sdk';
import { buildDynamicContext, STATIC_RULES } from './promptBuilder.js';

const SYSTEM_PROMPT = `You are an expert technical interviewer and talent assessor with 25 years of experience evaluating candidates from freshers to CTOs across enterprise technology stacks. You generate precise, seniority-calibrated interview question banks with detailed scoring rubrics. You always return valid JSON only — no explanation, no markdown fences, no preamble. Pure JSON. CRITICAL: escape all newlines as \\n and all double-quotes as \\" inside JSON string values.`;

export async function generateInterviewKit(env, args) {
  const client = new Anthropic({
    apiKey: env.CLAUDE_API_KEY,
    defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  });

  const dynamicContext = buildDynamicContext(args);

  const userContent = [
    {
      type: 'text',
      text: STATIC_RULES,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: dynamicContext,
    },
  ];

  let content = '';
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 24000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      content += chunk.delta.text;
    }
  }

  return parseJSON(content);
}

function parseJSON(raw) {
  try { return JSON.parse(raw); } catch (_) {}

  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}

  const m = stripped.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('Claude returned invalid JSON — could not extract object');
  try { return JSON.parse(m[1]); } catch (_) {}

  const repaired = m[1].replace(
    /"((?:[^"\\]|\\.)*)"/g,
    (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'),
  );
  return JSON.parse(repaired);
}
