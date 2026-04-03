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

// ---------------------------------------------------------------------------
// STATIC_RULES — identical on every request; sent with cache_control so the
// Anthropic API caches this block and skips re-processing it on regenerations.
// ---------------------------------------------------------------------------
const STATIC_RULES = `
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

ANSWER FORMAT RULES — TOKEN BUDGET (CRITICAL, follow exactly):
- strong_answer ONLY — do NOT generate weak_answer or average_answer fields at all
- strong_answer: Write in FIRST PERSON as the expert candidate. Structure as a mini-lesson:
  1. One-line crisp definition of the core concept (use **bold** for key terms)
  2. Explain the underlying mechanism — why it works this way
  3. Show HOW you apply it: a focused code block OR a concrete real-world scenario
  4. One sentence on a practitioner pitfall or trade-off
  Target: 100-150 words of prose. When code is needed add ONE fenced block (use correct language tag, e.g. \`\`\`python) with inline comments on key lines. Do NOT exceed 200 words total prose.
- Do NOT use rubric language ("A strong candidate would...") — speak directly as the candidate
- For fix_the_code strong_answer: name each bug + location, explain root-cause concept in 1-2 sentences, show corrected code in a fenced block with fix comments
- Voice: "So the key concept here is...", "Let me walk through how I'd approach this...", "The thing that trips most people up here is..."

OUTPUT REQUIREMENTS:
- Distribute questions proportionally across sections based on weight percentages
- SECTION ORDERING (CRITICAL): "Core Technology" section MUST be the FIRST element in the sections array
- score must be null, notes must be empty string ""
- kit_title should be a descriptive title based on the JD and seniority level
- question_type must be "fix_the_code" or "standard"
- code_snippet is required for fix_the_code questions, must be null for standard questions

ANSWER QUALITY REMINDERS (apply to every question without exception):
- strong_answer must always feel like the candidate is speaking live in an interview room, not reading from a textbook
- If the tech stack is Python, use Python code fences; if JavaScript, use JavaScript; always match the language to the stack
- Do not repeat the question text verbatim inside any answer field
- For fix_the_code questions the code_snippet field is REQUIRED and must be a realistic, real-world-looking snippet with intentional bugs only

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
          "strong_answer": "string",
          "score": null,
          "notes": ""
        }
      ]
    }
  ]
}`;

// ---------------------------------------------------------------------------
// buildDynamicContext — small per-request block (JD, seniority, regen list).
// This is NOT cached because it changes with every request.
// ---------------------------------------------------------------------------
function buildDynamicContext({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs, isRegenerate, previousQuestions }) {
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

  let ctx = `Generate a comprehensive interview kit for the following role.

JOB DESCRIPTION:
${jdText}

SENIORITY LEVEL: ${seniorityLevel}
TECH STACK: ${techStackStr}
TOTAL QUESTIONS REQUIRED: ${questionCount}
${customExpectations ? `CUSTOM EXPECTATIONS:\n${customExpectations}\n` : ''}SECTION WEIGHT DISTRIBUTION:
${sectionWeightsStr}

COMPLEXITY CALIBRATION:
${calibration}

QUESTION SOURCING:
${kbCount > 0
    ? `- Generate ${aiCount} questions (75%) yourself. Tag source: "AI", kb_label: null.\n- Select exactly ${kbCount} questions (25%) from the knowledge base below. Tag source: "KB", kb_label: <document label>.`
    : `- Generate all ${questionCount} questions yourself. Tag all source: "AI", kb_label: null.`
  }`;

  if (isRegenerate && previousQuestions && previousQuestions.length > 0) {
    ctx += `\n\nREGENERATION INSTRUCTION (CRITICAL): Generate completely fresh questions. Do NOT reuse, rephrase, or repeat any of these previously generated questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\nEvery question in this output must be brand new.`;
  }

  if (knowledgeBaseDocs && knowledgeBaseDocs.length > 0) {
    ctx += `\n\nKNOWLEDGE BASE CONTEXT:`;
    knowledgeBaseDocs.forEach((doc) => {
      ctx += `\n--- Document: ${doc.label} (Type: ${doc.document_type}) ---\n${doc.extracted_text}\n`;
    });
  }

  return ctx;
}

// Kept for any callers that use the single-string API
function buildPrompt(args) {
  return `${buildDynamicContext(args)}\n${STATIC_RULES}`;
}

module.exports = { buildPrompt, buildDynamicContext, STATIC_RULES, SENIORITY_CONFIG };
