import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGeneratingKitsStore } from '@/store/generatingKitsStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Download, FileSpreadsheet,
  CheckCircle2, Save, ArrowLeft, Calendar, Layers,
  RefreshCw, Eye, Bug, X, AlertTriangle, Square,
  Globe, Lock, RotateCcw, UserPlus, Users, UserCheck,
  Pencil, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort, cn } from '@/lib/utils';
import { useRegenerationStore } from '@/store/regenerationStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

const GENERATION_STEPS = [
  { label: 'Analyzing job description...', progress: 15 },
  { label: 'Calibrating for seniority level...', progress: 35 },
  { label: 'Building fresh question bank...', progress: 55 },
  { label: 'Generating scoring rubrics...', progress: 75 },
  { label: 'Finalizing interview kit...', progress: 90 },
];

const INTERVIEW_STAGES = [
  { value: 'scheduled',   label: 'Scheduled',   color: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  { value: 'in_progress', label: 'In Progress',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'completed',   label: 'Completed',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

function stageMeta(value) {
  return INTERVIEW_STAGES.find((s) => s.value === value) || INTERVIEW_STAGES[0];
}

// ---------- Answer renderer: parses ```lang\ncode\n``` fences ----------
function AnswerRenderer({ text }) {
  if (!text) return null;
  const parts = text.split(/(```[\w]*\n[\s\S]*?```|```[\s\S]*?```)/g);
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const fenceMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (fenceMatch) {
          const code = fenceMatch[2];
          return (
            <pre
              key={i}
              className="bg-zinc-900 text-green-300 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre border border-zinc-700"
            >
              {code}
            </pre>
          );
        }
        if (!part.trim()) return null;
        // Render **bold** markdown inline
        const segments = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
            {segments.map((seg, j) => {
              const boldMatch = seg.match(/^\*\*([^*]+)\*\*$/);
              return boldMatch
                ? <strong key={j} className="font-semibold text-zinc-900">{boldMatch[1]}</strong>
                : seg;
            })}
          </p>
        );
      })}
    </div>
  );
}

function StoppedKitCard({ kit, onBack, onRetried, variant = 'failed' }) {
  const isCancelled = variant === 'cancelled';

  const retryMutation = useMutation({
    mutationFn: () => api.post(`/interview/${kit.id}/retry`),
    onSuccess: (res) => {
      toast.success('Retrying generation', 'Kit generation has been restarted.');
      onRetried(res.data.kit);
    },
    onError: (err) => toast.error('Retry failed', err.response?.data?.error || 'Could not restart generation.'),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to History
      </button>
      <div className={`rounded-2xl border p-10 flex flex-col items-center gap-4 text-center ${isCancelled ? 'border-zinc-200 bg-zinc-50' : 'border-rose-200 bg-rose-50'}`}>
        {isCancelled
          ? <Square className="w-12 h-12 text-zinc-400" />
          : <AlertTriangle className="w-12 h-12 text-rose-400" />}
        <div>
          <h3 className={`text-lg font-semibold ${isCancelled ? 'text-zinc-700' : 'text-rose-800'}`}>
            {isCancelled ? 'Generation Stopped' : 'Generation Failed'}
          </h3>
          <p className={`text-sm mt-1 max-w-md ${isCancelled ? 'text-zinc-500' : 'text-rose-600'}`}>
            {kit.error_message || (isCancelled ? 'Generation was stopped by you.' : 'An error occurred during kit generation.')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {retryMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Retrying...</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Retry Generation</>
            )}
          </Button>
          <Button variant="outline" onClick={onBack} className="border-zinc-300 text-zinc-600">
            Back to History
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function KitView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kitData, setKitData] = useState(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [answerPanel, setAnswerPanel] = useState({ open: false, question: null });
  const stepTimers = useRef([]);

  // ── Candidate evaluation state ───────────────────────────────────────────
  const [selectedEvalId, setSelectedEvalId] = useState(null);
  const [candidateScores, setCandidateScores] = useState({}); // { [qId]: { score, notes } }
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandName, setNewCandName] = useState('');
  const [newCandRole, setNewCandRole] = useState('');
  const [newCandExp, setNewCandExp] = useState('');
  const [checkedEvalIds, setCheckedEvalIds] = useState(new Set());
  const [showRemoved, setShowRemoved] = useState(false);
  const [editingEvalId, setEditingEvalId] = useState(null);
  const [editFields, setEditFields] = useState({ name: '', role: '', exp: '' });

  const { startJob, updateJob, completeJob, failJob, clearJob, getJob } = useRegenerationStore();
  const regenJob = useRegenerationStore((s) => s.jobs[id]);
  const { remove: removeFromGenerating } = useGeneratingKitsStore();
  const prevStatusRef = useRef(null);

  const { data: fetchedKit, isLoading } = useQuery({
    queryKey: ['kit', id],
    queryFn: async () => {
      const res = await api.get(`/interview/${id}`);
      return res.data.kit;
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' ? 3000 : false,
  });

  // Fetch candidate evaluations once the kit is completed
  const { data: evaluations = [], refetch: refetchEvals } = useQuery({
    queryKey: ['kit', id, 'evaluations'],
    queryFn: async () => (await api.get(`/interview/${id}/evaluations?include_removed=true`)).data.evaluations,
    enabled: kitData?.status === 'completed',
    staleTime: 30_000,
  });

  const selectedEval = useMemo(
    () => evaluations.find((e) => e.id === selectedEvalId) || null,
    [evaluations, selectedEvalId],
  );

  const activeEvaluations = useMemo(
    () => evaluations.filter((e) => !e.removed_at),
    [evaluations],
  );
  const removedEvaluations = useMemo(
    () => evaluations.filter((e) => e.removed_at),
    [evaluations],
  );

  const handleSelectCandidate = useCallback((ev) => {
    setSelectedEvalId(ev.id);
    setCandidateScores(ev.scores_json || {});
  }, []);

  // Merge kit question with the active candidate's score/notes
  const qWithScores = useCallback((q) => {
    const s = candidateScores[String(q.id)] || { score: null, notes: '' };
    return { ...q, score: s.score ?? null, notes: s.notes ?? '' };
  }, [candidateScores]);

  useEffect(() => {
    if (!fetchedKit) return;
    const prev = prevStatusRef.current;
    const curr = fetchedKit.status;
    // Kit just finished generating — clear from global watcher (prevents double toast)
    if (prev === 'generating' && curr === 'completed') {
      removeFromGenerating(id);
      toast.success('Kit ready!', 'Your interview kit has been generated.');
    }
    prevStatusRef.current = curr;
    setKitData(fetchedKit);
  }, [fetchedKit]);

  // Clean up timers on unmount
  useEffect(() => () => stepTimers.current.forEach(clearTimeout), []);

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/interview/${id}/cancel`),
    onSuccess: (res) => {
      setKitData(res.data.kit);
      queryClient.invalidateQueries(['interview', 'history']);
      toast.success('Generation stopped', 'You can retry from this page whenever you\'re ready.');
    },
    onError: (err) => toast.error('Could not stop', err.response?.data?.error || 'Failed to stop generation.'),
  });

  const shareMutation = useMutation({
    mutationFn: () => api.post(`/interview/${id}/share`),
    onSuccess: (res) => {
      setKitData(res.data.kit);
      queryClient.invalidateQueries(['interview', 'shared']);
      const shared = res.data.kit.is_shared;
      toast.success(
        shared ? 'Kit shared' : 'Kit made private',
        shared ? 'Now visible in Shared Kits for all users.' : 'Only visible to you.'
      );
    },
    onError: (err) => toast.error('Could not update sharing', err.response?.data?.error || 'Please try again.'),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ isCompleted } = {}) => {
      if (!selectedEvalId) throw new Error('No candidate selected');
      const [scoresRes] = await Promise.all([
        api.patch(`/interview/${id}/evaluations/${selectedEvalId}/scores`, { scores_json: candidateScores }),
        isCompleted !== undefined
          ? api.patch(`/interview/${id}/scores`, { is_completed: isCompleted })
          : Promise.resolve(),
      ]);
      return scoresRes.data.evaluation;
    },
    onSuccess: (updatedEval) => {
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (e.id === selectedEvalId ? { ...e, ...updatedEval } : e))
      );
      if (saveMutation.variables?.isCompleted !== undefined) {
        setKitData((prev) => ({ ...prev, is_completed: saveMutation.variables.isCompleted }));
      }
      toast.success('Saved', 'Scores saved for this candidate.');
    },
    onError: (err) => toast.error('Save failed', err.message === 'No candidate selected'
      ? 'Select a candidate first.'
      : 'Could not save scores.'),
  });

  const createEvalMutation = useMutation({
    mutationFn: ({ candidateName, candidateRole, candidateExperienceYears }) =>
      api.post(`/interview/${id}/evaluations`, { candidateName, candidateRole, candidateExperienceYears }),
    onSuccess: (res) => {
      refetchEvals();
      handleSelectCandidate(res.data.evaluation);
      setShowAddCandidate(false);
      setNewCandName(''); setNewCandRole(''); setNewCandExp('');
      toast.success('Candidate added', `${res.data.evaluation.candidate_name} is now selected.`);
    },
    onError: (err) => toast.error('Failed', err.response?.data?.error || 'Could not add candidate.'),
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      return api.post('/interview/generate', {
        jdText: kitData.jd_text,
        seniorityLevel: kitData.seniority_level,
        techStack: kitData.tech_stack,
        customExpectations: kitData.custom_expectations || '',
        useKnowledgeBase: false,
        previousKitId: kitData.id,
      });
    },
    onMutate: () => {
      startJob(id);
      // Simulate progress steps
      GENERATION_STEPS.forEach((step, i) => {
        const t = setTimeout(() => {
          updateJob(id, step.progress, step.label);
        }, i * 2800);
        stepTimers.current.push(t);
      });
    },
    onSuccess: (res) => {
      stepTimers.current.forEach(clearTimeout);
      completeJob(id);
      clearJob(id);
      queryClient.invalidateQueries(['interview', 'history']);
      // Navigate immediately — new kit page will show generating state and poll
      navigate(`/kit/${res.data.kit.id}`);
    },
    onError: (err) => {
      stepTimers.current.forEach(clearTimeout);
      failJob(id, err.response?.data?.error || 'Regeneration failed. Please try again.');
      toast.error('Regeneration failed', err.response?.data?.error || 'The original kit is preserved.');
    },
  });

  const updateQuestionScore = useCallback((sectionIdx, questionIdx, score) => {
    if (!selectedEvalId) return;
    const qId = String(kitData.output_json.sections[sectionIdx].questions[questionIdx].id);
    setCandidateScores((prev) => ({
      ...prev,
      [qId]: { notes: prev[qId]?.notes ?? '', score },
    }));
  }, [selectedEvalId, kitData]);

  const updateQuestionNotes = useCallback((sectionIdx, questionIdx, notes) => {
    if (!selectedEvalId) return;
    const qId = String(kitData.output_json.sections[sectionIdx].questions[questionIdx].id);
    setCandidateScores((prev) => ({
      ...prev,
      [qId]: { score: prev[qId]?.score ?? null, notes },
    }));
  }, [selectedEvalId, kitData]);

  const resetMutation = useMutation({
    mutationFn: () => {
      if (!selectedEvalId) throw new Error('No candidate selected');
      return api.patch(`/interview/${id}/evaluations/${selectedEvalId}/scores`, { scores_json: {} });
    },
    onSuccess: (res) => {
      setCandidateScores({});
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (e.id === selectedEvalId ? { ...e, ...res.data.evaluation } : e))
      );
      setShowResetConfirm(false);
      toast.success('Scores reset', 'All scores cleared for this candidate.');
    },
    onError: () => toast.error('Reset failed', 'Could not clear scores.'),
  });

  const stageMutation = useMutation({
    mutationFn: ({ evalId, stage }) =>
      api.patch(`/interview/${id}/evaluations/${evalId}/stage`, { interviewStage: stage }),
    onSuccess: (res) => {
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (e.id === res.data.evaluation.id ? { ...e, ...res.data.evaluation } : e))
      );
    },
    onError: () => toast.error('Stage update failed', 'Could not change interview stage.'),
  });

  const removeMutation = useMutation({
    mutationFn: (evalId) => api.patch(`/interview/${id}/evaluations/${evalId}/remove`),
    onSuccess: (res, evalId) => {
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (e.id === evalId ? { ...e, removed_at: res.data.evaluation.removed_at } : e))
      );
      if (selectedEvalId === evalId) { setSelectedEvalId(null); setCandidateScores({}); }
      setCheckedEvalIds((prev) => { const next = new Set(prev); next.delete(evalId); return next; });
      toast.success('Candidate removed', 'Use "Show removed" to restore.');
    },
    onError: () => toast.error('Remove failed', 'Could not remove candidate.'),
  });

  const restoreMutation = useMutation({
    mutationFn: (evalId) => api.patch(`/interview/${id}/evaluations/${evalId}/restore`),
    onSuccess: (_, evalId) => {
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (e.id === evalId ? { ...e, removed_at: null } : e))
      );
      toast.success('Candidate restored');
    },
    onError: () => toast.error('Restore failed', 'Could not restore candidate.'),
  });

  const bulkRemoveMutation = useMutation({
    mutationFn: (evalIds) =>
      api.post(`/interview/${id}/evaluations/bulk-remove`, { evalIds }),
    onSuccess: (_, evalIds) => {
      const removedAt = new Date().toISOString();
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (evalIds.includes(e.id) ? { ...e, removed_at: removedAt } : e))
      );
      if (evalIds.includes(selectedEvalId)) { setSelectedEvalId(null); setCandidateScores({}); }
      setCheckedEvalIds(new Set());
      toast.success(`${evalIds.length} candidate${evalIds.length !== 1 ? 's' : ''} removed`);
    },
    onError: () => toast.error('Bulk remove failed', 'Could not remove selected candidates.'),
  });

  const updateEvalMutation = useMutation({
    mutationFn: ({ evalId, name, role, exp }) =>
      api.patch(`/interview/${id}/evaluations/${evalId}`, {
        candidateName: name,
        candidateRole: role || null,
        candidateExperienceYears: exp ? parseInt(exp, 10) : null,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(['kit', id, 'evaluations'], (old) =>
        (old || []).map((e) => (e.id === res.data.evaluation.id ? { ...e, ...res.data.evaluation } : e))
      );
      setEditingEvalId(null);
      setEditFields({ name: '', role: '', exp: '' });
      toast.success('Candidate updated');
    },
    onError: (err) => toast.error('Update failed', err.response?.data?.error || 'Could not update candidate.'),
  });

  const startEditing = useCallback((ev) => {
    setEditingEvalId(ev.id);
    setEditFields({
      name: ev.candidate_name || '',
      role: ev.candidate_role || '',
      exp: ev.candidate_experience_years != null ? String(ev.candidate_experience_years) : '',
    });
  }, []);

  const stopEditing = useCallback(() => {
    setEditingEvalId(null);
    setEditFields({ name: '', role: '', exp: '' });
  }, []);

  const cycleStage = useCallback((ev) => {
    const stages = ['scheduled', 'in_progress', 'completed'];
    const idx = stages.indexOf(ev.interview_stage || 'scheduled');
    stageMutation.mutate({ evalId: ev.id, stage: stages[(idx + 1) % stages.length] });
  }, [stageMutation]);

  const exportPDF = () => {
    if (!kitData) return;
    const doc = new jsPDF({ format: 'a4' });
    const kit = kitData.output_json;
    doc.setFontSize(18); doc.setTextColor(79, 70, 229);
    doc.text('InterviewIQ — Interview Kit', 14, 20);
    doc.setFontSize(12); doc.setTextColor(60, 60, 60);
    doc.text(kit.kit_title, 14, 30);
    doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    doc.text(`Seniority: ${kit.seniority}  |  Stack: ${kit.tech_stack?.join(', ')}`, 14, 38);
    doc.text(`Generated: ${formatDateShort(kitData.created_at)}`, 14, 44);
    let y = 54;
    kit.sections?.forEach((section, si) => {
      doc.setFontSize(12); doc.setTextColor(79, 70, 229);
      doc.text(`${section.section_name} (${section.weight_percentage}%)`, 14, y);
      y += 8;
      const tableData = section.questions.map((q) => {
        const s = candidateScores[String(q.id)] || {};
        return [
          `Q${q.id}`,
          q.question_type === 'fix_the_code' ? `[FIX] ${q.question}\n${q.code_snippet || ''}` : q.question,
          q.source === 'KB' ? `[KB] ${q.kb_label || ''}` : 'AI',
          q.best_answer ?? q.strong_answer ?? '',
          s.score != null ? `${s.score}/5` : 'N/A',
          s.notes || '',
        ];
      });
      autoTable(doc, {
        startY: y,
        head: [['#', 'Question', 'Src', 'Expert Answer', 'Score', 'Notes']],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 60 }, 2: { cellWidth: 14 }, 3: { cellWidth: 60 }, 4: { cellWidth: 12 }, 5: { cellWidth: 22 } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
      if (y > 270 && si < kit.sections.length - 1) { doc.addPage(); y = 20; }
    });
    doc.save(`${kit.kit_title?.replace(/[^a-z0-9]/gi, '_')}_InterviewKit.pdf`);
    toast.success('PDF exported');
  };

  const exportExcel = async () => {
    if (!kitData) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Interview Kit');
    ws.columns = [
      { header: 'Section',        key: 'Section',        width: 20 },
      { header: 'Weight %',       key: 'Weight %',       width: 10 },
      { header: 'Q#',             key: 'Q#',             width: 6  },
      { header: 'Type',           key: 'Type',           width: 14 },
      { header: 'Question',       key: 'Question',       width: 40 },
      { header: 'Code Snippet',   key: 'Code Snippet',   width: 30 },
      { header: 'Source',         key: 'Source',         width: 8  },
      { header: 'KB Label',       key: 'KB Label',       width: 16 },
      { header: 'Expert Answer',  key: 'Expert Answer',  width: 40 },
      { header: 'Score',          key: 'Score',          width: 8  },
      { header: 'Notes',          key: 'Notes',          width: 24 },
    ];
    kitData.output_json.sections?.forEach((section) => {
      section.questions?.forEach((q) => {
        ws.addRow({
          'Section': section.section_name, 'Weight %': section.weight_percentage,
          'Q#': q.id, 'Type': q.question_type || 'standard',
          'Question': q.question, 'Code Snippet': q.code_snippet || '',
          'Source': q.source, 'KB Label': q.kb_label || '',
          'Expert Answer': q.best_answer ?? q.strong_answer ?? '',
          'Score': candidateScores[String(q.id)]?.score ?? '', 'Notes': candidateScores[String(q.id)]?.notes || '',
        });
      });
    });
    const buffer = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kitData.output_json.kit_title?.replace(/[^a-z0-9]/gi, '_')}_InterviewKit.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Excel exported');
  };

  if (isLoading && !kitData) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Kit is being generated — show animated waiting screen
  if (kitData?.status === 'generating') {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <button onClick={() => navigate('/history')} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to History
        </button>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-10 flex flex-col items-center gap-6 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg"
          >
            <RefreshCw className="w-8 h-8 text-white" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-indigo-900">{kitData.kit_title}</h3>
            <p className="text-sm text-indigo-600 mt-1">
              Claude is generating your 30-question kit — this takes about a minute.
            </p>
            <p className="text-xs text-indigo-400 mt-2">This page auto-updates. You can navigate away freely.</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {kitData.tech_stack?.map((t) => (
              <Badge key={t} variant="outline" className="text-xs border-indigo-200 text-indigo-700">{t}</Badge>
            ))}
          </div>
          <Progress className="w-full max-w-xs h-1.5 [&>div]:bg-indigo-500 [&>div]:animate-pulse" value={75} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            {cancelMutation.isPending
              ? <><Square className="w-3.5 h-3.5 animate-pulse" /> Stopping...</>
              : <><Square className="w-3.5 h-3.5 fill-current" /> Stop Generation</>}
          </Button>
        </div>
      </div>
    );
  }

  // Generation cancelled by user
  if (kitData?.status === 'cancelled') {
    return (
      <StoppedKitCard
        kit={kitData}
        variant="cancelled"
        onBack={() => navigate('/history')}
        onRetried={(updatedKit) => {
          setKitData(updatedKit);
          queryClient.invalidateQueries(['kit', id]);
          queryClient.invalidateQueries(['interview', 'history']);
        }}
      />
    );
  }

  // Generation failed — show error with retry option
  if (kitData?.status === 'failed') {
    return (
      <StoppedKitCard
        kit={kitData}
        variant="failed"
        onBack={() => navigate('/history')}
        onRetried={(updatedKit) => {
          setKitData(updatedKit);
          queryClient.invalidateQueries(['kit', id]);
          queryClient.invalidateQueries(['interview', 'history']);
        }}
      />
    );
  }

  if (!kitData?.output_json) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const kit = kitData.output_json;
  const allQuestions = kit.sections?.flatMap((s) => s.questions) || [];
  const scoredEntries = Object.values(candidateScores).filter((v) => v?.score != null);
  const overallScore = scoredEntries.length > 0
    ? (scoredEntries.reduce((sum, v) => sum + Number(v.score), 0) / scoredEntries.length).toFixed(1)
    : null;
  const scoredCount = scoredEntries.length;
  const scorePercent = overallScore ? ((Number(overallScore) / 5) * 100).toFixed(0) : null;
  const isRegenerating = regenJob?.status === 'running';
  const regenFailed = regenJob?.status === 'error';

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-32">
      {/* Back */}
      <button onClick={() => navigate('/history')} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to History
      </button>

      {/* Regeneration progress banner */}
      <AnimatePresence>
        {(isRegenerating || regenFailed) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              'rounded-xl border p-4 space-y-2',
              regenFailed
                ? 'bg-rose-50 border-rose-200'
                : 'bg-violet-50 border-violet-200'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {regenFailed ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-violet-600 animate-spin" />
                )}
                <span className={cn('text-sm font-medium', regenFailed ? 'text-rose-700' : 'text-violet-700')}>
                  {regenFailed ? 'Regeneration failed — original kit preserved' : 'Regenerating interview kit...'}
                </span>
              </div>
              {regenFailed && (
                <button onClick={() => clearJob(id)} className="text-rose-400 hover:text-rose-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {isRegenerating && (
              <>
                <Progress value={regenJob?.progress || 0} className="h-1.5 bg-violet-100 [&>div]:bg-violet-500" />
                <p className="text-xs text-violet-500">{regenJob?.step}</p>
              </>
            )}
            {regenFailed && (
              <p className="text-xs text-rose-600">{regenJob?.error}</p>
            )}
            {isRegenerating && (
              <p className="text-xs text-zinc-500">You can keep scoring this kit — we'll take you to the new one when it's ready.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kit Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-zinc-900 leading-snug">{kit.kit_title}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={kitData.is_completed ? 'success' : 'warning'}>
              {kitData.is_completed ? 'Completed' : 'In Progress'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shareMutation.mutate()}
              disabled={shareMutation.isPending}
              className={kitData.is_shared
                ? 'h-7 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                : 'h-7 px-2 text-xs border-zinc-200 text-zinc-500 hover:bg-zinc-50'}
            >
              {kitData.is_shared
                ? <><Globe className="w-3 h-3" /> Shared</>
                : <><Lock className="w-3 h-3" /> Private</>}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
          <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />{kit.seniority}</span>
          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{formatDateShort(kitData.created_at)}</span>
          <span className="text-xs text-zinc-400">{allQuestions.length} questions</span>
          {kitData.generation_seconds > 0 && (
            <span className="text-xs text-zinc-400">
              Generated in {kitData.generation_seconds >= 60
                ? `${Math.floor(kitData.generation_seconds / 60)}m ${kitData.generation_seconds % 60}s`
                : `${kitData.generation_seconds}s`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {kit.tech_stack?.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
        </div>
      </div>

      {/* ── Candidates panel ─────────────────────────────────────────── */}
      <Card className="border-zinc-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-900">Candidates</span>
              {activeEvaluations.length > 0 && (
                <span className="text-xs text-zinc-400">({activeEvaluations.length})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {checkedEvalIds.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={() => bulkRemoveMutation.mutate([...checkedEvalIds])}
                  disabled={bulkRemoveMutation.isPending}
                >
                  <X className="w-3 h-3" /> Remove ({checkedEvalIds.size})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() => setShowAddCandidate(true)}
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Candidate
              </Button>
            </div>
          </div>

          {activeEvaluations.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-3">
              No candidates yet — add one to start scoring.
            </p>
          ) : (
            <div className="space-y-1">
              {activeEvaluations.map((ev) => {
                const isSelected = ev.id === selectedEvalId;
                const isChecked = checkedEvalIds.has(ev.id);
                const isEditing = editingEvalId === ev.id;
                const hasScores = Object.keys(ev.scores_json || {}).length > 0;
                const sm = stageMeta(ev.interview_stage);
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors',
                      isSelected
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-white border-zinc-100 hover:border-zinc-200',
                    )}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-indigo-600 shrink-0 cursor-pointer"
                      checked={isChecked}
                      onChange={(e) => {
                        setCheckedEvalIds((prev) => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(ev.id) : next.delete(ev.id);
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />

                    {isEditing ? (
                      /* ── Edit mode ── */
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Input
                          value={editFields.name}
                          onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                          disabled={hasScores}
                          title={hasScores ? 'Name cannot be changed once scoring has started' : undefined}
                          className="h-6 text-xs px-1.5 w-28"
                          placeholder="Name"
                        />
                        <Input
                          value={editFields.role}
                          onChange={(e) => setEditFields((f) => ({ ...f, role: e.target.value }))}
                          className="h-6 text-xs px-1.5 w-28"
                          placeholder="Role"
                        />
                        <Input
                          type="number"
                          min="0"
                          max="50"
                          value={editFields.exp}
                          onChange={(e) => setEditFields((f) => ({ ...f, exp: e.target.value }))}
                          className="h-6 text-xs px-1.5 w-14"
                          placeholder="Yrs"
                        />
                        <button
                          onClick={() => updateEvalMutation.mutate({ evalId: ev.id, name: editFields.name, role: editFields.role, exp: editFields.exp })}
                          disabled={!editFields.name.trim() || updateEvalMutation.isPending}
                          className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-40"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={stopEditing} className="p-1 text-zinc-400 hover:text-zinc-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Stage badge — click to cycle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleStage(ev); }}
                          className={cn(
                            'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap transition-colors',
                            sm.color,
                          )}
                        >
                          {sm.label}
                        </button>

                        {/* Main clickable area */}
                        <button
                          onClick={() => handleSelectCandidate(ev)}
                          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                        >
                          {isSelected && <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                          <span className={cn('font-medium text-sm truncate', isSelected ? 'text-indigo-800' : 'text-zinc-900')}>
                            {ev.candidate_name}
                          </span>
                          {ev.candidate_role && (
                            <span className="text-xs text-zinc-400 truncate">· {ev.candidate_role}</span>
                          )}
                          {ev.candidate_experience_years != null && (
                            <span className="text-xs text-zinc-400 shrink-0">{ev.candidate_experience_years}yr</span>
                          )}
                          {ev.overall_score != null && (
                            <Badge className={cn(
                              'text-[10px] px-1.5 py-0 shrink-0',
                              isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-600',
                            )}>
                              {ev.overall_score}/5
                            </Badge>
                          )}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditing(ev); }}
                          className="shrink-0 p-1 text-zinc-300 hover:text-zinc-600 rounded transition-colors"
                          title="Edit candidate"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>

                        {/* Remove */}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeMutation.mutate(ev.id); }}
                          className="shrink-0 p-1 text-zinc-300 hover:text-rose-600 rounded transition-colors"
                          title="Remove candidate"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!selectedEvalId && activeEvaluations.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Select a candidate above to load their scores.
            </p>
          )}

          {/* Show removed toggle */}
          {removedEvaluations.length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-2">
              <button
                onClick={() => setShowRemoved((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', showRemoved && 'rotate-180')} />
                {showRemoved ? 'Hide' : 'Show'} removed ({removedEvaluations.length})
              </button>
              {showRemoved && (
                <div className="mt-2 space-y-1">
                  {removedEvaluations.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-zinc-100 bg-zinc-50"
                    >
                      <Badge className="text-[10px] bg-zinc-200 text-zinc-500 border-0 shrink-0">Removed</Badge>
                      <span className="text-sm text-zinc-400 font-medium truncate flex-1">{ev.candidate_name}</span>
                      {ev.candidate_role && (
                        <span className="text-xs text-zinc-300 truncate">· {ev.candidate_role}</span>
                      )}
                      <button
                        onClick={() => restoreMutation.mutate(ev.id)}
                        disabled={restoreMutation.isPending}
                        className="shrink-0 text-xs text-indigo-500 hover:text-indigo-700 font-medium disabled:opacity-40"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Sections ─────────────────────────────────────────────────── */}
      <Tabs defaultValue={kit.sections?.[0]?.section_name}>
        <TabsList className="flex-wrap h-auto gap-1 bg-zinc-100 p-1">
          {kit.sections?.map((section) => (
            <TabsTrigger key={section.section_name} value={section.section_name} className="text-xs">
              {section.section_name}
              <span className="ml-1.5 text-zinc-400">{section.weight_percentage}%</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {kit.sections?.map((section, sectionIdx) => (
          <TabsContent key={section.section_name} value={section.section_name} className="space-y-4 mt-4">
            {section.questions?.map((question, qIdx) => (
              <QuestionCard
                key={question.id}
                question={qWithScores(question)}
                questionIdx={qIdx}
                sectionIdx={sectionIdx}
                onScoreChange={updateQuestionScore}
                onNotesChange={updateQuestionNotes}
                onRevealAnswer={() => setAnswerPanel({ open: true, question })}
                disabled={!selectedEvalId}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Bottom back link */}
      <button
        onClick={() => navigate('/history')}
        className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors mt-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back to History
      </button>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-zinc-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-auto min-w-0">
            {selectedEval ? (
              <>
                <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="text-sm font-medium text-indigo-700 truncate max-w-[140px]">
                  {selectedEval.candidate_name}
                </span>
                <span className="text-sm text-zinc-500">
                  {scoredCount}/{allQuestions.length} scored
                </span>
                {overallScore && (
                  <span className="text-sm font-semibold text-indigo-600">{overallScore}/5 ({scorePercent}%)</span>
                )}
              </>
            ) : (
              <span className="text-sm text-zinc-400 italic">Select a candidate to score</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={isRegenerating}
            className="border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isRegenerating && 'animate-spin')} />
            {isRegenerating ? 'Regenerating...' : 'Regenerate'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            disabled={resetMutation.isPending || !selectedEvalId}
            className="border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40"
            title="Clear all scores for selected candidate"
          >
            <RotateCcw className="w-4 h-4" /> Reset Scores
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveMutation.mutate({})}
            disabled={saveMutation.isPending || !selectedEvalId}
            className="disabled:opacity-40"
          >
            <Save className="w-4 h-4" /> Save
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={() => saveMutation.mutate({ isCompleted: true })}
            disabled={saveMutation.isPending || !selectedEvalId}
            className="disabled:opacity-40"
          >
            <CheckCircle2 className="w-4 h-4" /> Complete
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Download className="w-4 h-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Regenerate confirmation */}
      <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Interview Kit?</DialogTitle>
            <DialogDescription>
              Claude will generate a completely fresh set of 30 questions for the same role and tech stack.
              All questions will be different from this kit. Your current kit stays in History.
              You can continue scoring this kit while generation runs in the background.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>Cancel</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => { setShowRegenerateConfirm(false); regenerateMutation.mutate(); }}
            >
              <RefreshCw className="w-4 h-4" /> Yes, Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset scores confirmation */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Scores?</DialogTitle>
            <DialogDescription>
              This will clear every score and note recorded on this kit and mark it as In Progress.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="w-4 h-4" />
              {resetMutation.isPending ? 'Resetting...' : 'Yes, Reset Scores'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Candidate dialog */}
      <Dialog open={showAddCandidate} onOpenChange={(o) => { setShowAddCandidate(o); if (!o) { setNewCandName(''); setNewCandRole(''); setNewCandExp(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
            <DialogDescription>
              Create an evaluation record for a new candidate. Their scores will be tracked independently.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Candidate Name <span className="text-rose-500">*</span></Label>
              <Input
                placeholder="e.g. Jane Smith"
                value={newCandName}
                onChange={(e) => setNewCandName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newCandName.trim() && createEvalMutation.mutate({ candidateName: newCandName, candidateRole: newCandRole, candidateExperienceYears: newCandExp || null })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role Applied For</Label>
                <Input
                  placeholder="e.g. Backend Engineer"
                  value={newCandRole}
                  onChange={(e) => setNewCandRole(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Years of Experience</Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  placeholder="e.g. 4"
                  value={newCandExp}
                  onChange={(e) => setNewCandExp(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCandidate(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!newCandName.trim() || createEvalMutation.isPending}
              onClick={() => createEvalMutation.mutate({
                candidateName: newCandName,
                candidateRole: newCandRole || undefined,
                candidateExperienceYears: newCandExp ? parseInt(newCandExp, 10) : undefined,
              })}
            >
              {createEvalMutation.isPending ? 'Adding...' : 'Add Candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Answer side panel */}
      <Sheet open={answerPanel.open} onOpenChange={(o) => setAnswerPanel({ open: o, question: answerPanel.question })}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
          <div className="px-6 py-4 border-b border-zinc-100 bg-emerald-50">
            <SheetHeader>
              <SheetTitle className="text-emerald-800 flex items-center gap-2">
                <Eye className="w-4 h-4" /> Expert Answer
              </SheetTitle>
            </SheetHeader>
            {answerPanel.question && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  {answerPanel.question.question_type === 'fix_the_code' && (
                    <Badge className="bg-orange-100 text-orange-700 border-0 text-xs gap-1">
                      <Bug className="w-3 h-3" /> Fix the Code
                    </Badge>
                  )}
                  {answerPanel.question.source === 'KB' ? (
                    <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">KB</Badge>
                  ) : (
                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">AI</Badge>
                  )}
                </div>
                <p className="text-sm font-medium text-zinc-800 leading-relaxed">
                  {answerPanel.question.question}
                </p>
                {answerPanel.question.question_type === 'fix_the_code' && answerPanel.question.code_snippet && (
                  <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre border border-zinc-700 mt-2">
                    {answerPanel.question.code_snippet}
                  </pre>
                )}
              </div>
            )}
          </div>
          <div className="px-6 py-5 flex-1 space-y-5">
            {answerPanel.question && (answerPanel.question.weak_answer ? (
              <>
                {/* Weak */}
                <div className="rounded-xl border border-rose-200 overflow-hidden">
                  <div className="bg-rose-50 border-b border-rose-100 px-4 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                    <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Weak answer</span>
                    <span className="ml-auto text-[10px] text-rose-400 font-medium">Score ≈ 2</span>
                  </div>
                  <div className="px-4 py-3">
                    <AnswerRenderer text={answerPanel.question.weak_answer} />
                  </div>
                </div>

                {/* Good */}
                <div className="rounded-xl border border-amber-200 overflow-hidden">
                  <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Good answer</span>
                    <span className="ml-auto text-[10px] text-amber-400 font-medium">Score ≈ 4</span>
                  </div>
                  <div className="px-4 py-3">
                    <AnswerRenderer text={answerPanel.question.good_answer} />
                  </div>
                </div>

                {/* Best */}
                <div className="rounded-xl border border-emerald-200 overflow-hidden">
                  <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Best answer</span>
                    <span className="ml-auto text-[10px] text-emerald-500 font-medium">Score ≈ 5</span>
                  </div>
                  <div className="px-4 py-3">
                    <AnswerRenderer text={answerPanel.question.best_answer} />
                  </div>
                </div>
              </>
            ) : (
              /* Legacy kit — single strong_answer */
              <>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Expert answer &amp; concept breakdown
                </p>
                <AnswerRenderer text={answerPanel.question.strong_answer} />
              </>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function QuestionCard({ question, sectionIdx, questionIdx, onScoreChange, onNotesChange, onRevealAnswer, disabled }) {
  const [expanded, setExpanded] = useState(false);
  const isFixCode = question.question_type === 'fix_the_code';

  return (
    <Card className={cn('border-zinc-200 overflow-hidden', isFixCode && 'border-l-4 border-l-orange-400')}>
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
              Q{question.id}
            </span>
            <div className="flex-1 space-y-2 min-w-0">
              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {isFixCode && (
                  <Badge className="bg-orange-100 text-orange-700 border-0 text-xs px-1.5 gap-1">
                    <Bug className="w-3 h-3" /> Fix the Code
                  </Badge>
                )}
                {question.source === 'KB' ? (
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs px-1.5">
                    KB{question.kb_label ? ` · ${question.kb_label}` : ''}
                  </Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 border-0 text-xs px-1.5">AI</Badge>
                )}
              </div>

              {/* Question */}
              <p className="text-sm font-medium text-zinc-900 leading-relaxed">{question.question}</p>

              {/* Code snippet */}
              {isFixCode && question.code_snippet && (
                <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre border border-zinc-700">
                  {question.code_snippet}
                </pre>
              )}

              {/* Score buttons */}
              <div className={cn('flex items-center gap-2 flex-wrap', disabled && 'opacity-40 pointer-events-none')}>
                <span className="text-xs text-zinc-500 shrink-0">Score:</span>
                {[
                  { label: 'Weak', value: 2, active: 'bg-rose-500 text-white border-rose-500', hover: 'hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700' },
                  { label: 'Good', value: 4, active: 'bg-amber-500 text-white border-amber-500', hover: 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700' },
                  { label: 'Best', value: 5, active: 'bg-emerald-500 text-white border-emerald-500', hover: 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700' },
                ].map(({ label, value, active, hover }) => (
                  <motion.button
                    key={label}
                    whileTap={disabled ? {} : { scale: 0.95 }}
                    onClick={() => !disabled && onScoreChange(sectionIdx, questionIdx, question.score === value ? null : value)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-semibold transition-all border',
                      question.score === value ? active : `bg-white text-zinc-500 border-zinc-200 ${hover}`
                    )}
                  >
                    {label}
                  </motion.button>
                ))}
                <div className="flex items-center gap-1 ml-1">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={question.score ?? ''}
                    onChange={(e) => {
                      if (disabled) return;
                      const v = parseInt(e.target.value, 10);
                      onScoreChange(sectionIdx, questionIdx, v >= 1 && v <= 5 ? v : null);
                    }}
                    placeholder="—"
                    className="w-9 h-7 text-center text-xs border border-zinc-200 rounded-md bg-white text-zinc-700 focus:outline-none focus:border-indigo-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-zinc-400">/5</span>
                </div>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={onRevealAnswer}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md transition-colors border border-emerald-200"
                >
                  <Eye className="w-3.5 h-3.5" /> Reveal Answer
                </button>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded ? 'Hide' : 'Show'} notes
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 ml-8">
                <Textarea
                  placeholder={disabled ? 'Select a candidate to add notes' : 'Notes for this question...'}
                  className="text-xs min-h-[60px] resize-none"
                  value={question.notes || ''}
                  disabled={disabled}
                  onChange={(e) => onNotesChange(sectionIdx, questionIdx, e.target.value)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
