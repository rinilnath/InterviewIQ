const SENIORITY_CONFIG = {
  'Fresher (0-1 yr)': {
    questionCount: 30,
    weights: {
      'Core Technology': 60,
      'Problem Solving': 20,
      'Situational & Pressure Handling': 20,
    },
    calibration: 'Focus on syntax, basic OOP, simple data structures, and fundamentals only. Keep questions entry-level.',
  },
  'Junior Developer (1-3 yrs)': {
    questionCount: 30,
    weights: {
      'Core Technology': 60,
      'Problem Solving': 20,
      'Situational & Pressure Handling': 20,
    },
    calibration: 'Focus on core language features, basic frameworks, simple debugging. Slightly more depth than fresher.',
  },
  'Mid-Level Developer (3-5 yrs)': {
    questionCount: 30,
    weights: {
      'Core Technology': 40,
      'System Design & Architecture': 25,
      'Problem Solving': 20,
      'Analytical Thinking': 15,
    },
    calibration: 'Focus on design patterns, REST APIs, DB optimization, unit testing. Expect practical experience.',
  },
  'Senior Developer (5-8 yrs)': {
    questionCount: 30,
    weights: {
      'Core Technology': 40,
      'System Design & Architecture': 25,
      'Problem Solving': 20,
      'Analytical Thinking': 15,
    },
    calibration: 'Focus on system design, performance tuning, code reviews, mentoring scenarios. Deep expertise expected.',
  },
  'Tech Lead (8-12 yrs)': {
    questionCount: 30,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on team decisions, technical debt tradeoffs, delivery under pressure, conflict resolution.',
  },
  'Solution Architect (10-15 yrs)': {
    questionCount: 30,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on enterprise integration, cloud strategy, multi-system design, NFR handling.',
  },
  'Enterprise Architect (15-20 yrs)': {
    questionCount: 30,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on TOGAF alignment, governance, org-wide technology strategy, vendor evaluation, roadmap planning.',
  },
  'Technology Head / CTO (20+ yrs)': {
    questionCount: 30,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on business and technology alignment, technology vision, budget decisions, build vs buy, org transformation, board communication.',
  },
};

function buildPrompt({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs, isRegenerate, previousQuestions }) {
  const config = SENIORITY_CONFIG[seniorityLevel];
  if (!config) throw new Error(`Unknown seniority level: ${seniorityLevel}`);

  const { questionCount, weights, calibration } = config;
  const techStackStr = Array.isArray(techStack) ? techStack.join(', ') : techStack;

  const sectionWeightsStr = Object.entries(weights)
    .map(([section, weight]) => `  - ${section}: ${weight}%`)
    .join('\n');

  const kbCount = knowledgeBaseDocs && knowledgeBaseDocs.length > 0
    ? Math.round(questionCount * 0.25)
    : 0;
  const aiCount = questionCount - kbCount;

  let prompt = `Generate a comprehensive interview kit for the following role.

JOB DESCRIPTION:
${jdText}

SENIORITY LEVEL: ${seniorityLevel}
TECH STACK: ${techStackStr}
TOTAL QUESTIONS REQUIRED: ${questionCount}
${customExpectations ? `CUSTOM EXPECTATIONS:\n${customExpectations}\n` : ''}
SECTION WEIGHT DISTRIBUTION:
${sectionWeightsStr}

COMPLEXITY CALIBRATION:
${calibration}

QUESTION SOURCING:
${kbCount > 0
  ? `- Generate ${aiCount} questions (75%) yourself based on seniority, JD, and tech stack. Tag these with source: "AI" and kb_label: null.
- Select exactly ${kbCount} questions (25%) from the knowledge base context provided below. Tag these with source: "KB" and include the document label in kb_label.`
  : `- Generate all ${questionCount} questions yourself based on seniority, JD, and tech stack. Tag all with source: "AI" and kb_label: null.`
}
${isRegenerate && previousQuestions && previousQuestions.length > 0 ? `
REGENERATION INSTRUCTION (CRITICAL):
This is a regeneration request. You MUST generate completely fresh questions. Do NOT reuse, rephrase, or repeat any of the following previously generated questions:
${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
Every single question in this output must be brand new and distinct from the above list.
` : ''}
CORE TECHNOLOGY SECTION RULES (CRITICAL):
- All "Core Technology" questions MUST be hands-on and practical — ask the candidate to write code, debug a snippet, explain their implementation approach, or reason through a real technical problem
- Do NOT generate theoretical definitions, history lessons, or "what is X" questions for Core Technology
- Good examples: "Write a function that...", "How would you implement X in [stack]?", "What happens step-by-step when you call X?", "Identify and fix the issue in this code..."
- Bad examples: "What is polymorphism?", "Explain REST", "What are the advantages of microservices?"
- Even for Fresher/Junior levels, Core Technology questions must test hands-on thinking, not textbook recall

PROBLEM SOLVING SECTION RULES (CRITICAL):
- At least 40% of "Problem Solving" questions MUST be "fix_the_code" type
- For fix_the_code questions: write a realistic code snippet (8-15 lines) in the relevant tech stack with 1-3 intentional bugs (logic errors, off-by-one, null handling, wrong API usage, type errors, etc.)
- The code_snippet must be clean, well-indented, readable — only the bugs should be wrong
- The question text for fix_the_code should be: "Find and fix the bug(s) in the following code:"
- Remaining Problem Solving questions should be algorithmic or design problem questions

STRONG ANSWER FORMAT RULES (CRITICAL):
- Write strong_answer in FIRST PERSON, as if you are the expert candidate answering in the actual interview
- Sound confident, technically sharp, and natural — like a distinguished senior professional speaking
- The answer is displayed in a dedicated side panel and will be scrollable — so write with DEPTH and EDUCATIONAL RICHNESS, not brevity
- STRUCTURE your answer like a mini-lesson: (1) crisp one-line definition of the core concept if applicable, (2) explain the underlying mechanism or "why it works this way", (3) show HOW you apply it with a code example or real scenario, (4) share a nuance, pitfall, or trade-off a practitioner would know
- Aim for 150-300 words of prose PLUS a code block where relevant — this is a learning resource, not a tweet
- When code is needed, use markdown code fences with the language tag: \`\`\`javascript\\n...\\n\`\`\` — show a complete, runnable and meaningful example (not pseudo-code), with inline comments explaining key lines
- Do NOT use rubric language like "A strong candidate would..." or "The ideal answer is..." — speak directly as the candidate
- For fix_the_code questions: (1) name each bug and its location, (2) explain in 1-2 sentences WHY each bug causes the failure (the root cause concept), (3) show the fully corrected code in a fenced block with comments marking the fixes, (4) add a brief note on the underlying concept so the reader learns from it
- Start with first-person framing: "So the key concept here is...", "Let me walk through how I'd approach this...", "The thing that trips most people up here is..."
- Use markdown bold (**term**) to highlight key technical terms when defining them

OUTPUT REQUIREMENTS:
- Distribute questions proportionally across sections based on weight percentages
- SECTION ORDERING (CRITICAL): The "Core Technology" section MUST always be the FIRST element in the sections array. All other sections follow after it in any order.
- score must be null, notes must be empty string ""
- kit_title should be a descriptive title based on the JD and seniority level
- question_type must be "fix_the_code" or "standard"
- code_snippet is required for fix_the_code questions, must be null for standard questions

REQUIRED JSON OUTPUT SCHEMA (return ONLY this JSON, no other text):
{
  "kit_title": "string",
  "seniority": "string",
  "tech_stack": ["string"],
  "total_questions": number,
  "sections": [
    {
      "section_name": "string",
      "weight_percentage": number,
      "questions": [
        {
          "id": number,
          "question": "string",
          "question_type": "standard" | "fix_the_code",
          "code_snippet": "string | null",
          "source": "AI" | "KB",
          "kb_label": "string | null",
          "weak_answer": "string",
          "average_answer": "string",
          "strong_answer": "string",
          "score": null,
          "notes": ""
        }
      ]
    }
  ]
}`;

  if (knowledgeBaseDocs && knowledgeBaseDocs.length > 0) {
    prompt += `\n\nKNOWLEDGE BASE CONTEXT:\n`;
    knowledgeBaseDocs.forEach((doc) => {
      prompt += `\n--- Document: ${doc.label} (Type: ${doc.document_type}) ---\n${doc.extracted_text}\n`;
    });
  }

  return prompt;
}

module.exports = { buildPrompt, SENIORITY_CONFIG };
