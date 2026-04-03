import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Trash2,
  FileText,
  ChevronRight,
  Filter,
  PlusCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort, SENIORITY_LEVELS } from '@/lib/utils';

export default function History() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [seniority, setSeniority] = useState('');
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['interview', 'history', search, seniority, status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: 50, page: 1 });
      if (search) params.append('search', search);
      if (seniority && seniority !== 'all') params.append('seniority', seniority);
      if (status && status !== 'all') params.append('status', status);
      const res = await api.get(`/interview/history?${params}`);
      return res.data;
    },
    staleTime: 0,
    // Auto-poll while any kit in the list is still generating
    refetchInterval: (query) =>
      query.state.data?.kits?.some((k) => k.status === 'generating') ? 4000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: (id) => api.post(`/interview/${id}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries(['interview', 'history']);
      toast.success('Retrying generation', 'Kit generation has been restarted.');
    },
    onError: (err) => toast.error('Retry failed', err.response?.data?.error || 'Could not restart generation.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/interview/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['interview', 'history']);
      queryClient.invalidateQueries(['trash', 'summary']);
      setDeleteId(null);
      // Non-intrusive: inform user they can recover from Trash
      toast.success('Moved to Trash', 'Recover it from the Trash folder within 30 days if needed.');
    },
    onError: () => toast.error('Delete failed', 'Could not delete the kit.'),
  });

  const kits = data?.kits || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Interview History</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {data?.total ? `${data.total} total kit${data.total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
          <Link to="/generate">
            <PlusCircle className="w-4 h-4" />
            New Kit
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Search kits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={seniority} onValueChange={setSeniority}>
          <SelectTrigger className="w-[200px]">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
            <SelectValue placeholder="All seniorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All seniorities</SelectItem>
            {SENIORITY_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error state */}
      {isError && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          Failed to load history: {error?.response?.data?.error || error?.message || 'Unknown error'}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : kits.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-zinc-900">No interview kits found</h3>
          <p className="text-sm text-zinc-500 mt-1 mb-4">
            {search || seniority || status
              ? 'Try adjusting your filters.'
              : 'Generate your first interview kit to get started.'}
          </p>
          {!search && !seniority && !status && (
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <Link to="/generate">Generate Kit</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {kits.map((kit, i) => (
            <motion.div
              key={kit.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="border-zinc-200 hover:border-indigo-200 transition-colors group">
                <CardContent className="p-4 flex items-center gap-4">
                  <Link to={`/kit/${kit.id}`} className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate group-hover:text-indigo-600 transition-colors">
                          {kit.kit_title || 'Untitled Kit'}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-zinc-500 mt-1">
                          <span>{kit.seniority_level}</span>
                          {user?.role === 'admin' && kit.users?.name && (
                            <span>By: {kit.users.name}</span>
                          )}
                          <span>{formatDateShort(kit.created_at)}</span>
                          {Array.isArray(kit.tech_stack) && (
                            <span>{kit.tech_stack.slice(0, 3).join(', ')}{kit.tech_stack.length > 3 ? '...' : ''}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {kit.status === 'generating' && (
                          <Badge className="bg-indigo-100 text-indigo-700 border-0 gap-1 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> Generating
                          </Badge>
                        )}
                        {kit.status === 'failed' && (
                          <>
                            <Badge className="bg-rose-100 text-rose-700 border-0 gap-1">
                              <AlertTriangle className="w-3 h-3" /> Failed
                            </Badge>
                            <button
                              onClick={(e) => { e.preventDefault(); retryMutation.mutate(kit.id); }}
                              disabled={retryMutation.isPending && retryMutation.variables === kit.id}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-1.5 py-0.5 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" /> Retry
                            </button>
                          </>
                        )}
                        {kit.status !== 'generating' && kit.status !== 'failed' && (
                          <Badge variant={kit.is_completed ? 'success' : 'warning'}>
                            {kit.is_completed ? 'Completed' : 'In Progress'}
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => setDeleteId(kit.id)}
                    className="text-zinc-300 hover:text-rose-500 transition-colors p-1 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Interview Kit</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The kit and all scoring data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
