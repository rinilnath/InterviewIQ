const SENIORITY_CONFIG = {
  'Fresher (0-1 yr)': {
    questionCount: 8,
    weights: {
      'Core Technology': 60,
      'Problem Solving': 20,
      'Situational & Pressure Handling': 20,
    },
    calibration: 'Focus on syntax, basic OOP, simple data structures, and fundamentals only. Keep questions entry-level.',
  },
  'Junior Developer (1-3 yrs)': {
    questionCount: 10,
    weights: {
      'Core Technology': 60,
      'Problem Solving': 20,
      'Situational & Pressure Handling': 20,
    },
    calibration: 'Focus on core language features, basic frameworks, simple debugging. Slightly more depth than fresher.',
  },
  'Mid-Level Developer (3-5 yrs)': {
    questionCount: 12,
    weights: {
      'Core Technology': 40,
      'System Design & Architecture': 25,
      'Problem Solving': 20,
      'Analytical Thinking': 15,
    },
    calibration: 'Focus on design patterns, REST APIs, DB optimization, unit testing. Expect practical experience.',
  },
  'Senior Developer (5-8 yrs)': {
    questionCount: 15,
    weights: {
      'Core Technology': 40,
      'System Design & Architecture': 25,
      'Problem Solving': 20,
      'Analytical Thinking': 15,
    },
    calibration: 'Focus on system design, performance tuning, code reviews, mentoring scenarios. Deep expertise expected.',
  },
  'Tech Lead (8-12 yrs)': {
    questionCount: 18,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on team decisions, technical debt tradeoffs, delivery under pressure, conflict resolution.',
  },
  'Solution Architect (10-15 yrs)': {
    questionCount: 20,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on enterprise integration, cloud strategy, multi-system design, NFR handling.',
  },
  'Enterprise Architect (15-20 yrs)': {
    questionCount: 22,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on TOGAF alignment, governance, org-wide technology strategy, vendor evaluation, roadmap planning.',
  },
  'Technology Head / CTO (20+ yrs)': {
    questionCount: 25,
    weights: {
      'System Design & Architecture': 35,
      'Analytical Thinking': 25,
      'Situational & Pressure Handling': 25,
      'Core Technology': 15,
    },
    calibration: 'Focus on business and technology alignment, technology vision, budget decisions, build vs buy, org transformation, board communication.',
  },
};

function buildPrompt({ jdText, seniorityLevel, techStack, customExpectations, knowledgeBaseDocs }) {
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
  : '- Generate all ${questionCount} questions yourself based on seniority, JD, and tech stack. Tag all with source: "AI" and kb_label: null.'
}

OUTPUT REQUIREMENTS:
- Distribute questions proportionally across sections based on weight percentages
- Each question must have weak_answer, average_answer, and strong_answer rubrics (2-3 sentences each)
- score must be null, notes must be empty string ""
- kit_title should be a descriptive title based on the JD and seniority level
- Ensure questions are appropriately calibrated for the seniority level

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
