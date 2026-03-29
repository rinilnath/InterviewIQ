const Anthropic = require('@anthropic-ai/sdk');
const { buildPrompt } = require('../utils/promptBuilder');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const SYSTEM_PROMPT = `You are an expert technical interviewer and talent assessor with 25 years of experience evaluating candidates from freshers to CTOs across enterprise technology stacks. You generate precise, seniority-calibrated interview question banks with detailed scoring rubrics. You understand the exact difference in expectations between each seniority level. You always return valid JSON only. No explanation, no markdown fences, no preamble. Pure JSON. CRITICAL: All string values in the JSON must have newlines escaped as \\n, backslashes escaped as \\\\, and double quotes escaped as \\". Never include raw unescaped newlines inside JSON string values.`;

async function generateInterviewKit({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs, isRegenerate, previousQuestions }) {
  const userPrompt = buildPrompt({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs, isRegenerate, previousQuestions });

  let content = '';
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      content += chunk.delta.text;
    }
  }

  // Parse with progressive fallback
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_e1) {
    // Strip any wrapping markdown fences Claude may have added despite instructions
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (_e2) {
      // Try to extract the outermost JSON object
      const jsonMatch = stripped.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) throw new Error('Claude returned invalid JSON — could not extract object');
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (_e3) {
        // Last resort: fix unescaped literal newlines inside JSON string values
        const repaired = jsonMatch[1].replace(
          /"((?:[^"\\]|\\.)*)"/g,
          (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        );
        parsed = JSON.parse(repaired);
      }
    }
  }

  return parsed;
}

module.exports = { generateInterviewKit };
