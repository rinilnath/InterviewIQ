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
- All "Core Technology" questions MUST test conceptual and theoretical understanding — whether the candidate truly grasps WHY something works the way it does, not HOW to write code with it
- Do NOT ask implementation questions: "How do you implement X?", "Write a function that…", "What is the syntax for…"
- Do NOT ask shallow definitions: "What is X?", "List the features of Y", "What are the advantages of Z?"
- Ask about underlying mechanisms, design decisions, trade-offs, and failure modes — things that only make sense once you've used the technology in a real project and encountered its rough edges
- Good examples: "Why does the JavaScript event loop process microtasks before the next macrotask — and what bug does misunderstanding this cause?", "Why can adding an index slow down writes more than it helps reads, and when does that trade-off tip the other way?", "What does the database engine actually do when two concurrent transactions both try to UPDATE the same row?"
- Bad examples: "How do you implement a singleton in Java?", "What is the difference between SQL and NoSQL?", "Explain how you would use React hooks"

SENIORITY CALIBRATION FOR CORE TECHNOLOGY — apply based on the SENIORITY LEVEL field:
- Fresher / Junior (0–3 yrs): Ask foundational concepts a developer first encounters when building their first real feature — things you discover after something breaks in a dev environment. The candidate must explain the mechanism, not just name the API. Example topics: why mutation causes bugs in immutable-style code, what actually happens during an HTTP request-response cycle beyond "the browser sends a request", why an ORM query is slow without knowing SQL.
- Mid-Level (3–5 yrs): Ask about internals, trade-offs, and production reasoning that only surface after shipping real systems. Questions should require knowing what failure looks like. Example topics: why connection pool exhaustion kills a service, how a garbage collector decides what to collect and why that creates latency spikes, when optimistic locking beats pessimistic locking and the exact scenario where it backfires.
- Senior and above (5+ yrs): Ask architectural thinking, failure cascade scenarios, and system-level cause-and-effect. The candidate should reason about ripple effects across components. Example topics: how TCP slow-start interacts with short-lived HTTP connections under load, why eventual consistency forces idempotency on application code and where that constraint originates, how the JVM JIT warm-up curve affects latency SLAs for freshly deployed services.

THE LITMUS TEST (apply to every Core Technology question before finalising it): A candidate who has read the documentation but never shipped with this technology in production should NOT be able to give a confident, complete answer. If the answer appears in the "Getting Started" guide or the first paragraph of a Wikipedia article, the question is too shallow — generate a harder one.

PROBLEM SOLVING SECTION RULES (CRITICAL):
- At least 40% of "Problem Solving" questions MUST be "fix_the_code" type
- For fix_the_code questions: write a realistic code snippet (8-15 lines) in the relevant tech stack with 1-3 intentional bugs (logic errors, off-by-one, null handling, wrong API usage, type errors, etc.)
- The code_snippet must be clean, well-indented, readable — only the bugs should be wrong
- The question text for fix_the_code should be: "Find and fix the bug(s) in the following code:"
- Remaining Problem Solving questions should be algorithmic or design problem questions

ANSWER FORMAT RULES — THREE TIERS (CRITICAL, follow exactly):
Generate exactly three answer tiers for every question: weak_answer, good_answer, best_answer. No other answer fields.

- weak_answer: 1–2 sentences. What a candidate says when they have heard the term but do not truly understand it. Surface-level phrasing, misses the key mechanism or trade-off entirely. Sounds plausible but is incomplete or slightly wrong. Do NOT make it obviously wrong — it should feel like a real weak interview answer.

- good_answer: 3–4 sentences. Correct, clear understanding. Names the key concept, explains how it works, mentions the main trade-off or implication. Solid and accurate but does not go beyond the textbook explanation. No code needed unless essential.

- best_answer: 4–6 lines. Write in FIRST PERSON as an experienced practitioner. Structure:
  1. Name the core mechanism in one crisp sentence (use **bold** for key terms)
  2. Explain WHY it works this way — the design decision or underlying principle
  3. Give a concrete real-world consequence, failure mode, or trade-off that only surfaces in production
  4. One sharp closing sentence showing depth (e.g. an edge case, a counter-intuitive implication, or a pitfall)
  When code is genuinely needed, add ONE fenced block (correct language tag, e.g. \`\`\`python) with inline comments. Do NOT exceed 220 words total for best_answer.
  Voice: "The key thing here is...", "What actually happens is...", "The pitfall most people hit is..."

For fix_the_code questions, apply the tiers as follows:
- weak_answer: spots one bug or describes it vaguely without explaining why it is wrong
- good_answer: correctly identifies all bugs and fixes them with a brief explanation
- best_answer: identifies and fixes all bugs, explains the root-cause concept behind each one, shows corrected code in a fenced block with fix comments, and notes the production impact if this bug shipped undetected

Do NOT use rubric language ("A strong candidate would...") in any tier — state it as if answering directly.

OUTPUT REQUIREMENTS:
- Distribute questions proportionally across sections based on weight percentages
- SECTION ORDERING (CRITICAL): "Core Technology" section MUST be the FIRST element in the sections array
- score must be null, notes must be empty string ""
- kit_title should be a descriptive title based on the JD and seniority level
- question_type must be "fix_the_code" or "standard"
- code_snippet is required for fix_the_code questions, must be null for standard questions

ANSWER QUALITY REMINDERS (apply to every question without exception):
- best_answer must always feel like the candidate is speaking live in an interview room, not reading from a textbook
- weak_answer must sound like a real (plausible but shallow) interview response — not obviously wrong, just incomplete
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
          "weak_answer": "string",
          "good_answer": "string",
          "best_answer": "string",
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
function buildDynamicContext({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs, isRegenerate, previousQuestions, kbPercentage = 0 }) {
  const config = SENIORITY_CONFIG[seniorityLevel];
  if (!config) throw new Error(`Unknown seniority level: ${seniorityLevel}`);

  const { questionCount, weights, calibration } = config;
  const techStackStr = Array.isArray(techStack) ? techStack.join(', ') : techStack;

  const sectionWeightsStr = Object.entries(weights)
    .map(([section, weight]) => `  - ${section}: ${weight}%`)
    .join('\n');

  const hasKB = knowledgeBaseDocs && knowledgeBaseDocs.length > 0 && kbPercentage > 0;
  const effectivePct = hasKB ? kbPercentage : 0;
  const kbCount = hasKB ? Math.round(questionCount * (effectivePct / 100)) : 0;
  const aiCount = questionCount - kbCount;
  const isFullKB = effectivePct === 100;

  let sourcingInstruction;
  if (!hasKB) {
    sourcingInstruction = `- Generate all ${questionCount} questions yourself. Tag all source: "AI", kb_label: null.`;
  } else if (isFullKB) {
    sourcingInstruction = `- ALL ${questionCount} questions MUST be sourced from the knowledge base documents provided below.\n- Focus entirely on the topics, concepts, technologies, and scenarios present in those documents.\n- If the documents do not contain enough distinct concepts for ${questionCount} questions, expand the depth (different angles, edge cases, code variants) of the available concepts rather than inventing unrelated material.\n- Tag source: "KB", kb_label: <document label> for every question.`;
  } else {
    sourcingInstruction = `- Generate ${aiCount} questions (${100 - effectivePct}%) yourself. Tag source: "AI", kb_label: null.\n- Source exactly ${kbCount} questions (${effectivePct}%) from the knowledge base below. Tag source: "KB", kb_label: <document label>.`;
  }

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
${sourcingInstruction}`;

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
