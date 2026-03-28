import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Save,
  ArrowLeft,
  Calendar,
  Layers,
  RefreshCw,
  Eye,
  EyeOff,
  Bug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort, calculateOverallScore, cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function KitView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kitData, setKitData] = useState(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const { data: fetchedKit, isLoading } = useQuery({
    queryKey: ['kit', id],
    queryFn: async () => {
      const res = await api.get(`/interview/${id}`);
      return res.data.kit;
    },
  });

  // Sync query data (including cache hits) into local editable state
  useEffect(() => {
    if (fetchedKit) setKitData(fetchedKit);
  }, [fetchedKit]);

  const saveMutation = useMutation({
    mutationFn: async ({ isCompleted }) => {
      const res = await api.patch(`/interview/${id}/scores`, {
        output_json: kitData.output_json,
        is_completed: isCompleted !== undefined ? isCompleted : kitData.is_completed,
      });
      return res.data.kit;
    },
    onSuccess: (updated) => {
      setKitData(updated);
      queryClient.invalidateQueries(['kit', id]);
      toast.success('Saved', 'Progress saved successfully.');
    },
    onError: () => toast.error('Save failed', 'Could not save progress.'),
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/interview/generate', {
        jdText: kitData.jd_text,
        seniorityLevel: kitData.seniority_level,
        techStack: kitData.tech_stack,
        customExpectations: kitData.custom_expectations || '',
        useKnowledgeBase: false,
        previousKitId: kitData.id,
      });
      return res.data.kit;
    },
    onSuccess: (newKit) => {
      queryClient.invalidateQueries(['interview', 'history']);
      toast.success('Regenerated', 'Fresh interview kit is ready.');
      navigate(`/kit/${newKit.id}`);
    },
    onError: (err) => toast.error('Regeneration failed', err.response?.data?.error || 'Please try again.'),
  });

  const updateQuestionScore = useCallback((sectionIdx, questionIdx, score) => {
    setKitData((prev) => {
      const sections = prev.output_json.sections.map((s, si) =>
        si !== sectionIdx ? s : {
          ...s,
          questions: s.questions.map((q, qi) =>
            qi !== questionIdx ? q : { ...q, score }
          ),
        }
      );
      return { ...prev, output_json: { ...prev.output_json, sections } };
    });
  }, []);

  const updateQuestionNotes = useCallback((sectionIdx, questionIdx, notes) => {
    setKitData((prev) => {
      const sections = prev.output_json.sections.map((s, si) =>
        si !== sectionIdx ? s : {
          ...s,
          questions: s.questions.map((q, qi) =>
            qi !== questionIdx ? q : { ...q, notes }
          ),
        }
      );
      return { ...prev, output_json: { ...prev.output_json, sections } };
    });
  }, []);

  const exportPDF = () => {
    if (!kitData) return;
    const doc = new jsPDF({ format: 'a4' });
    const kit = kitData.output_json;

    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229);
    doc.text('InterviewIQ — Interview Kit', 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(kit.kit_title, 14, 30);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Seniority: ${kit.seniority}  |  Stack: ${kit.tech_stack?.join(', ')}`, 14, 38);
    doc.text(`Generated: ${formatDateShort(kitData.created_at)}`, 14, 44);

    let y = 54;
    kit.sections?.forEach((section, si) => {
      doc.setFontSize(12);
      doc.setTextColor(79, 70, 229);
      doc.text(`${section.section_name} (${section.weight_percentage}%)`, 14, y);
      y += 8;

      const tableData = section.questions.map((q) => [
        `Q${q.id}`,
        q.question_type === 'fix_the_code' ? `[FIX CODE] ${q.question}\n${q.code_snippet || ''}` : q.question,
        q.source === 'KB' ? `[KB] ${q.kb_label || ''}` : 'AI',
        q.strong_answer,
        q.score !== null && q.score !== undefined ? `${q.score}/5` : 'N/A',
        q.notes || '',
      ]);

      autoTable(doc, {
        startY: y,
        head: [['#', 'Question', 'Source', 'Strong Answer', 'Score', 'Notes']],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 65 },
          2: { cellWidth: 18 },
          3: { cellWidth: 55 },
          4: { cellWidth: 12 },
          5: { cellWidth: 22 },
        },
        margin: { left: 14, right: 14 },
      });

      y = doc.lastAutoTable.finalY + 10;
      if (y > 270 && si < kit.sections.length - 1) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`${kit.kit_title?.replace(/[^a-z0-9]/gi, '_')}_InterviewKit.pdf`);
    toast.success('PDF exported', 'Interview kit downloaded as PDF.');
  };

  const exportExcel = () => {
    if (!kitData) return;
    const kit = kitData.output_json;
    const rows = [];
    kit.sections?.forEach((section) => {
      section.questions?.forEach((q) => {
        rows.push({
          Section: section.section_name,
          'Weight %': section.weight_percentage,
          'Q#': q.id,
          Type: q.question_type || 'standard',
          Question: q.question,
          'Code Snippet': q.code_snippet || '',
          Source: q.source,
          'KB Label': q.kb_label || '',
          'Weak Answer': q.weak_answer,
          'Average Answer': q.average_answer,
          'Strong Answer': q.strong_answer,
          Score: q.score !== null && q.score !== undefined ? q.score : '',
          Notes: q.notes || '',
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Interview Kit');
    XLSX.writeFile(wb, `${kit.kit_title?.replace(/[^a-z0-9]/gi, '_')}_InterviewKit.xlsx`);
    toast.success('Excel exported', 'Interview kit downloaded as Excel.');
  };

  if (isLoading || !kitData) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const kit = kitData.output_json;
  const overallScore = calculateOverallScore(kit.sections);
  const allQuestions = kit.sections?.flatMap((s) => s.questions) || [];
  const scoredCount = allQuestions.filter((q) => q.score !== null && q.score !== undefined).length;
  const scorePercent = overallScore ? ((overallScore / 5) * 100).toFixed(0) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-32">
      {/* Back button */}
      <button
        onClick={() => navigate('/history')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to History
      </button>

      {/* Kit Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-zinc-900 leading-snug">{kit.kit_title}</h2>
          <Badge variant={kitData.is_completed ? 'success' : 'warning'}>
            {kitData.is_completed ? 'Completed' : 'In Progress'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> {kit.seniority}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> {formatDateShort(kitData.created_at)}
          </span>
          <span className="text-xs text-zinc-400">{allQuestions.length} questions</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {kit.tech_stack?.map((t) => (
            <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
          ))}
        </div>
      </div>

      {/* Sections / Questions */}
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
                question={question}
                questionIdx={qIdx}
                sectionIdx={sectionIdx}
                onScoreChange={updateQuestionScore}
                onNotesChange={updateQuestionNotes}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 bg-white border-t border-zinc-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          {/* Score indicator */}
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-sm font-medium text-zinc-700">
              {scoredCount}/{allQuestions.length} scored
            </span>
            {overallScore && (
              <span className="text-sm font-semibold text-indigo-600">
                {overallScore}/5 ({scorePercent}%)
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRegenerateConfirm(true)}
            className="border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <RefreshCw className="w-4 h-4" />
            Regenerate
          </Button>

          <Button variant="outline" size="sm" onClick={() => saveMutation.mutate({})} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4" />
            Save
          </Button>

          <Button variant="success" size="sm" onClick={() => saveMutation.mutate({ isCompleted: true })} disabled={saveMutation.isPending}>
            <CheckCircle2 className="w-4 h-4" />
            Complete
          </Button>

          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Download className="w-4 h-4" />
            PDF
          </Button>

          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
        </div>
      </div>

      {/* Regenerate confirmation dialog */}
      <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Interview Kit?</DialogTitle>
            <DialogDescription>
              Claude will generate a completely fresh set of 30 questions for the same role and tech stack.
              All questions will be different from this kit. Your current kit will remain in History.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>Cancel</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => { setShowRegenerateConfirm(false); regenerateMutation.mutate(); }}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Yes, Regenerate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionCard({ question, sectionIdx, questionIdx, onScoreChange, onNotesChange }) {
  const [expanded, setExpanded] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
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
              {/* Badges row */}
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

              {/* Question text */}
              <p className="text-sm font-medium text-zinc-900 leading-relaxed">
                {question.question}
              </p>

              {/* Code snippet for fix_the_code questions */}
              {isFixCode && question.code_snippet && (
                <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap border border-zinc-700">
                  {question.code_snippet}
                </pre>
              )}

              {/* Score buttons */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">Score:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <motion.button
                      key={score}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onScoreChange(sectionIdx, questionIdx, question.score === score ? null : score)}
                      className={cn(
                        'w-8 h-8 rounded-md text-sm font-medium transition-all border',
                        question.score === score
                          ? score <= 2
                            ? 'bg-rose-500 text-white border-rose-500'
                            : score === 3
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50'
                      )}
                    >
                      {score}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Action buttons row */}
              <div className="flex items-center gap-3 pt-1">
                {/* Reveal strong answer */}
                <button
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md transition-colors border border-emerald-200"
                >
                  {showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                </button>

                {/* Toggle full rubric */}
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded ? 'Hide' : 'Show'} full rubric
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Strong answer reveal panel */}
        <AnimatePresence>
          {showAnswer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mb-3 ml-11 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Strong Answer
                </p>
                <p className="text-xs text-emerald-900 leading-relaxed font-mono whitespace-pre-wrap">
                  {question.strong_answer}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full rubric expandable */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 ml-8 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-100">
                    <p className="text-xs font-semibold text-rose-700 mb-1">Weak Answer</p>
                    <p className="text-xs text-rose-800 leading-relaxed">{question.weak_answer}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Average Answer</p>
                    <p className="text-xs text-amber-800 leading-relaxed">{question.average_answer}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Strong Answer</p>
                    <p className="text-xs text-emerald-900 font-mono leading-relaxed whitespace-pre-wrap">{question.strong_answer}</p>
                  </div>
                </div>
                <Textarea
                  placeholder="Notes for this question..."
                  className="text-xs min-h-[60px] resize-none"
                  value={question.notes || ''}
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
