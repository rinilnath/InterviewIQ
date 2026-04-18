import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart2, RefreshCw, EyeOff, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort, cn } from '@/lib/utils';

const CANDIDATE_STATUSES = [
  { value: 'in_progress', label: 'In Progress',  color: 'bg-amber-100 text-amber-700'   },
  { value: 'selected',    label: 'Selected',      color: 'bg-emerald-100 text-emerald-700' },
  { value: 'rejected',    label: 'Rejected',      color: 'bg-rose-100 text-rose-700'      },
  { value: 'on_hold',     label: 'On Hold',       color: 'bg-zinc-100 text-zinc-600'      },
];

function statusMeta(value) {
  return CANDIDATE_STATUSES.find((s) => s.value === value) || CANDIDATE_STATUSES[0];
}

function ScorePill({ score }) {
  if (score == null) return <span className="text-xs text-zinc-400">—</span>;
  const num = Number(score);
  const color = num >= 4 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : num >= 3 ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-rose-700 bg-rose-50 border-rose-200';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border', color)}>
      {score}/5
    </span>
  );
}

export default function InterviewResults() {
  const queryClient = useQueryClient();
  const [showRemoved, setShowRemoved] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['interview', 'results'],
    queryFn: async () => (await api.get('/interview/results?include_removed=true')).data,
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, kitId, resultStatus }) =>
      api.patch(`/interview/${kitId}/evaluations/${id}/status`, { resultStatus }),
    onSuccess: (_, vars) => {
      queryClient.setQueryData(['interview', 'results'], (old) => {
        if (!old) return old;
        return {
          ...old,
          results: old.results.map((r) =>
            r.id === vars.id ? { ...r, result_status: vars.resultStatus } : r
          ),
        };
      });
    },
    onError: () => toast.error('Update failed', 'Could not update candidate status.'),
  });

  const allResults = data?.results || [];
  const activeCount = allResults.filter((r) => !r.removed_at).length;
  const removedCount = allResults.filter((r) => r.removed_at).length;
  const filteredResults = allResults.filter((r) => showRemoved || !r.removed_at);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Interview Results</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {activeCount} candidate{activeCount !== 1 ? 's' : ''} interviewed
          </p>
        </div>
        <div className="flex items-center gap-3">
          {removedCount > 0 && (
            <button
              onClick={() => setShowRemoved((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                showRemoved
                  ? 'text-indigo-600 hover:text-indigo-800'
                  : 'text-zinc-400 hover:text-zinc-700',
              )}
            >
              {showRemoved
                ? <><Eye className="w-3.5 h-3.5" /> Hide removed ({removedCount})</>
                : <><EyeOff className="w-3.5 h-3.5" /> Show removed ({removedCount})</>}
            </button>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filteredResults.length === 0 && !showRemoved ? (
        <div className="text-center py-20 border border-zinc-100 rounded-2xl bg-zinc-50">
          <BarChart2 className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-zinc-900">No results yet</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Open a completed kit and add candidates to start tracking interview outcomes.
          </p>
        </div>
      ) : (
        <Card className="border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Role Applied For</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Exp.</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Kit Title</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Seniority</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Interviewed By</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Interview Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => {
                  const isRemoved = !!r.removed_at;
                  const meta = statusMeta(r.result_status);
                  return (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className={cn(
                        'border-b border-zinc-100 last:border-0',
                        isRemoved ? 'opacity-50 bg-zinc-50/50' : 'hover:bg-zinc-50/50',
                      )}
                    >
                      {/* Candidate */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className={cn('font-medium', isRemoved ? 'text-zinc-400 line-through' : 'text-zinc-900')}>
                            {r.candidate_name}
                          </p>
                          {isRemoved && (
                            <Badge className="text-[10px] bg-zinc-200 text-zinc-500 border-0 shrink-0">
                              Removed
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Role Applied For */}
                      <td className="px-4 py-3 text-zinc-600 max-w-[160px] truncate" title={r.candidate_role}>
                        {r.candidate_role || '—'}
                      </td>

                      {/* Experience */}
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {r.candidate_experience_years != null
                          ? `${r.candidate_experience_years} yr${r.candidate_experience_years !== 1 ? 's' : ''}`
                          : '—'}
                      </td>

                      {/* Kit Title */}
                      <td className="px-4 py-3 text-zinc-600 max-w-[180px] truncate" title={r.kit_title}>
                        <a
                          href={`/kit/${r.kit_id}`}
                          className="hover:text-indigo-600 hover:underline transition-colors"
                        >
                          {r.kit_title}
                        </a>
                      </td>

                      {/* Seniority */}
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {r.seniority_level}
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        <ScorePill score={r.overall_score} />
                      </td>

                      {/* Status — show dropdown for active, static badge for removed */}
                      <td className="px-4 py-3">
                        {isRemoved ? (
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', meta.color)}>
                            {meta.label}
                          </span>
                        ) : (
                          <Select
                            value={r.result_status}
                            onValueChange={(val) =>
                              statusMutation.mutate({ id: r.id, kitId: r.kit_id, resultStatus: val })
                            }
                          >
                            <SelectTrigger className={cn(
                              'h-7 w-32 text-xs font-medium border-0 shadow-none px-2',
                              meta.color
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CANDIDATE_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value} className="text-xs">
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>

                      {/* Interviewed By */}
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {r.interviewed_by}
                      </td>

                      {/* Interview Date */}
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {formatDateShort(r.interview_date)}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
