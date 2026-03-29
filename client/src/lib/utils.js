import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function formatDateShort(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function calculateOverallScore(sections) {
  if (!sections || sections.length === 0) return null;
  const allQuestions = sections.flatMap((s) => s.questions || []);
  const scoredQuestions = allQuestions.filter((q) => q.score !== null && q.score !== undefined);
  if (scoredQuestions.length === 0) return null;
  const total = scoredQuestions.reduce((sum, q) => sum + Number(q.score), 0);
  return (total / scoredQuestions.length).toFixed(1);
}

export function getScoreColor(score) {
  if (!score) return 'text-zinc-400';
  const num = Number(score);
  if (num >= 4) return 'text-emerald-600';
  if (num >= 3) return 'text-amber-600';
  return 'text-rose-600';
}

export function getStatusBadgeVariant(isCompleted) {
  return isCompleted ? 'success' : 'warning';
}

export const SENIORITY_LEVELS = [
  'Fresher (0-1 yr)',
  'Junior Developer (1-3 yrs)',
  'Mid-Level Developer (3-5 yrs)',
  'Senior Developer (5-8 yrs)',
  'Tech Lead (8-12 yrs)',
  'Solution Architect (10-15 yrs)',
  'Enterprise Architect (15-20 yrs)',
  'Technology Head / CTO (20+ yrs)',
];

export const DOCUMENT_TYPES = [
  { value: 'INTERVIEW_PREP_NOTES', label: 'Interview Prep Notes' },
  { value: 'SCENARIO_QUESTIONS', label: 'Scenario Questions' },
  { value: 'STUDY_NOTES', label: 'Study Notes' },
  { value: 'CLIENT_INTERVIEW_QUESTIONS', label: 'Client Interview Questions' },
  { value: 'CLIENT_EXPECTATIONS', label: 'Client Expectations' },
];

export const DOC_TYPE_COLORS = {
  INTERVIEW_PREP_NOTES: 'bg-blue-100 text-blue-700',
  SCENARIO_QUESTIONS: 'bg-purple-100 text-purple-700',
  STUDY_NOTES: 'bg-emerald-100 text-emerald-700',
  CLIENT_INTERVIEW_QUESTIONS: 'bg-amber-100 text-amber-700',
  CLIENT_EXPECTATIONS: 'bg-rose-100 text-rose-700',
};
