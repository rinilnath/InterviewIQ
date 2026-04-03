import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trash2, RotateCcw, AlertTriangle, FileText, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort, cn } from '@/lib/utils';

function DaysRemainingBadge({ days }) {
  if (days <= 1) return (
    <Badge className="bg-rose-100 text-rose-700 border-0 gap-1 text-xs">
      <AlertTriangle className="w-3 h-3" /> Expires today
    </Badge>
  );
  if (days <= 3) return (
    <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{days}d left</Badge>
  );
  return (
    <Badge className="bg-zinc-100 text-zinc-500 border-0 text-xs">{days}d left</Badge>
  );
}

export default function Trash() {
  const queryClient = useQueryClient();
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [permanentDeleteId, setPermanentDeleteId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['interview', 'trash'],
    queryFn: async () => {
      const res = await api.get('/interview/trash');
      return res.data;
    },
  });

  const kits = data?.kits || [];

  const invalidate = () => {
    queryClient.invalidateQueries(['interview', 'trash']);
    queryClient.invalidateQueries(['interview', 'history']);
    queryClient.invalidateQueries(['trash', 'summary']);
  };

  const restoreMutation = useMutation({
    mutationFn: (id) => api.post(`/interview/trash/${id}/restore`),
    onSuccess: () => {
      invalidate();
      toast.success('Kit restored', 'The interview kit is back in your History.');
    },
    onError: () => toast.error('Restore failed', 'Could not restore the kit.'),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/interview/trash/${id}`),
    onSuccess: () => {
      invalidate();
      setPermanentDeleteId(null);
      toast.success('Permanently deleted', 'The kit has been removed forever.');
    },
    onError: () => toast.error('Delete failed', 'Could not delete the kit.'),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => api.delete('/interview/trash/empty'),
    onSuccess: () => {
      invalidate();
      setConfirmEmptyOpen(false);
      toast.success('Trash emptied', 'All trashed kits have been permanently deleted.');
    },
    onError: () => toast.error('Failed', 'Could not empty trash.'),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Trash</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Deleted kits are kept for 30 days, then permanently removed.
          </p>
        </div>
        {kits.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmEmptyOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Empty Trash
          </Button>
        )}
      </div>

      {/* Warning banner for items expiring today */}
      {kits.some((k) => k.days_remaining <= 1) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-800">Items expiring today</p>
            <p className="text-xs text-rose-600 mt-0.5">
              One or more kits will be permanently deleted today. Restore them now if you need them.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : kits.length === 0 ? (
        <div className="text-center py-20">
          <Trash2 className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-zinc-900">Trash is empty</h3>
          <p className="text-sm text-zinc-500 mt-1">Deleted interview kits will appear here.</p>
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
              <Card className={cn('border-zinc-200', kit.days_remaining <= 1 && 'border-rose-200 bg-rose-50/30')}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {kit.kit_title || 'Untitled Kit'}
                      </p>
                      <DaysRemainingBadge days={kit.days_remaining} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-zinc-400 mt-1">
                      <span>{kit.seniority_level}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Deleted {formatDateShort(kit.deleted_at)}
                      </span>
                      {Array.isArray(kit.tech_stack) && (
                        <span>{kit.tech_stack.slice(0, 3).join(', ')}{kit.tech_stack.length > 3 ? '...' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreMutation.mutate(kit.id)}
                      disabled={restoreMutation.isPending}
                      className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPermanentDeleteId(kit.id)}
                      className="text-zinc-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Confirm permanent delete */}
      <Dialog open={!!permanentDeleteId} onOpenChange={(o) => !o && setPermanentDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete Kit</DialogTitle>
            <DialogDescription>
              This cannot be undone. The kit will be gone forever — it cannot be restored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => permanentDeleteMutation.mutate(permanentDeleteId)}
              disabled={permanentDeleteMutation.isPending}
            >
              {permanentDeleteMutation.isPending ? 'Deleting...' : 'Delete Forever'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm empty trash */}
      <Dialog open={confirmEmptyOpen} onOpenChange={setConfirmEmptyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Empty Trash</DialogTitle>
            <DialogDescription>
              All {kits.length} kit{kits.length !== 1 ? 's' : ''} in trash will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEmptyOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => emptyTrashMutation.mutate()}
              disabled={emptyTrashMutation.isPending}
            >
              {emptyTrashMutation.isPending ? 'Emptying...' : 'Empty Trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
