const Anthropic = require('@anthropic-ai/sdk');
const { buildDynamicContext, STATIC_RULES } = require('../utils/promptBuilder');

// Enable prompt-caching beta so the static rules block is reused across calls.
const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
});

// System prompt is small — include it in the cached user-message block instead
// of as a standalone system field so all cacheable content is in one prefix.
const SYSTEM_PROMPT = `You are an expert technical interviewer and talent assessor with 25 years of experience evaluating candidates from freshers to CTOs across enterprise technology stacks. You generate precise, seniority-calibrated interview question banks with detailed scoring rubrics. You always return valid JSON only — no explanation, no markdown fences, no preamble. Pure JSON. CRITICAL: escape all newlines as \\n and all double-quotes as \\" inside JSON string values.`;

async function generateInterviewKit(args) {
  const dynamicContext = buildDynamicContext(args);

  // Message content is split into two blocks:
  //   [0] STATIC_RULES  — cached; identical on every call (rules + schema)
  //   [1] dynamicContext — NOT cached; changes per request (JD, seniority, regen list)
  //
  // Anthropic caches the prefix up to (and including) the last cache_control block,
  // so block [0] must come first.
  const userContent = [
    {
      type: 'text',
      text: STATIC_RULES,
      cache_control: { type: 'ephemeral' }, // ~1 200 tokens — cached for 5 min
    },
    {
      type: 'text',
      text: dynamicContext,
    },
  ];

  let content = '';
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 24000,           // 30 q × (120w strong + 12w weak + 14w avg + question + code) ≈ 15–18K tokens
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
  // Stage 1 — direct parse (happy path)
  try { return JSON.parse(raw); } catch (_) {}

  // Stage 2 — strip accidental markdown fences
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}

  // Stage 3 — extract outermost JSON object
  const m = stripped.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('Claude returned invalid JSON — could not extract object');
  try { return JSON.parse(m[1]); } catch (_) {}

  // Stage 4 — repair unescaped control characters inside string values
  const repaired = m[1].replace(
    /"((?:[^"\\]|\\.)*)"/g,
    (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'),
  );
  return JSON.parse(repaired);
}

module.exports = { generateInterviewKit };
