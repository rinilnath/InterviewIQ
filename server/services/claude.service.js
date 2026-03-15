const Anthropic = require('@anthropic-ai/sdk');
const { buildPrompt } = require('../utils/promptBuilder');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const SYSTEM_PROMPT = `You are an expert technical interviewer and talent assessor with 25 years of experience evaluating candidates from freshers to CTOs across enterprise technology stacks. You generate precise, seniority-calibrated interview question banks with detailed scoring rubrics. You understand the exact difference in expectations between each seniority level. You always return valid JSON only. No explanation, no markdown fences, no preamble. Pure JSON.`;

async function generateInterviewKit({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs }) {
  const userPrompt = buildPrompt({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0].text;

  // Parse and validate JSON
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from response if there's any wrapping text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Claude returned invalid JSON');
    }
  }

  return parsed;
}

module.exports = { generateInterviewKit };
