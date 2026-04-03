import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FileText, CheckCircle2, Clock, Users, BookOpen,
  PlusCircle, ArrowRight, Trash2, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort } from '@/lib/utils';

const containerVariants = { animate: { transition: { staggerChildren: 0.07 } } };
const cardVariants = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

export default function Dashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['interview', 'history', 'dashboard'],
    queryFn: async () => {
      const res = await api.get('/interview/history?limit=5&page=1');
      return res.data;
    },
  });

  const { data: adminData, isLoading: adminLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const [usersRes, docsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/documents'),
      ]);
      return {
        userCount: usersRes.data.users?.length || 0,
        docCount: docsRes.data.documents?.length || 0,
      };
    },
    enabled: user?.role === 'admin',
  });

  // Lightweight check: items expiring within 24 h — banner shown only when > 0
  const { data: trashSummary } = useQuery({
    queryKey: ['trash', 'summary'],
    queryFn: async () => {
      const res = await api.get('/interview/trash/summary');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => api.delete('/interview/all'),
    onSuccess: () => {
      queryClient.invalidateQueries(['interview']);
      queryClient.invalidateQueries(['trash', 'summary']);
      setConfirmDeleteAll(false);
      toast.success('All kits moved to trash', 'Recover them from Trash within 30 days.');
    },
    onError: () => toast.error('Failed', 'Could not delete all kits.'),
  });

  const kits = historyData?.kits || [];
  const total = historyData?.total || 0;
  const completed = kits.filter((k) => k.is_completed).length;
  const pending = kits.filter((k) => !k.is_completed).length;

  const stats = [
    { label: 'Total Kits', value: isLoading ? '—' : total, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Completed', value: isLoading ? '—' : completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Pending', value: isLoading ? '—' : pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    ...(user?.role === 'admin' ? [
      { label: 'Total Users', value: adminLoading ? '—' : adminData?.userCount, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
      { label: 'KB Documents', value: adminLoading ? '—' : adminData?.docCount, icon: BookOpen, color: 'text-sky-600', bg: 'bg-sky-50' },
    ] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Trash expiry warning banner — only shown when items expire within 24 h */}
      {trashSummary?.expiringSoon > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-semibold">
              {trashSummary.expiringSoon} kit{trashSummary.expiringSoon !== 1 ? 's' : ''}
            </span>{' '}
            in your Trash will be permanently deleted within 24 hours.{' '}
            <Link to="/trash" className="underline font-medium hover:text-amber-900">
              Review Trash →
            </Link>
          </p>
        </motion.div>
      )}

      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">Here's your interview management overview.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteAll(true)}
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="w-4 h-4" /> Delete All Kits
            </Button>
          )}
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
            <Link to="/generate">
              <PlusCircle className="w-4 h-4" /> Generate Kit
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} variants={cardVariants}>
              <Card className="border-zinc-200">
                <CardContent className="pt-5 pb-4">
                  <div className={`inline-flex p-2 rounded-lg ${stat.bg} mb-3`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <div className="text-2xl font-semibold text-zinc-900">{stat.value}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{stat.label}</div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Recent Kits */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Interview Kits</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-indigo-600 hover:text-indigo-700 h-8">
            <Link to="/history">View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : kits.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No interview kits yet.</p>
              <Button asChild size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-700">
                <Link to="/generate">Generate your first kit</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {kits.map((kit) => (
                <Link
                  key={kit.id}
                  to={`/kit/${kit.id}`}
                  className="flex items-center justify-between py-3 hover:bg-zinc-50 rounded-md px-2 -mx-2 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 truncate group-hover:text-indigo-600 transition-colors">
                      {kit.kit_title || 'Untitled Kit'}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {kit.seniority_level} · {formatDateShort(kit.created_at)}
                    </p>
                  </div>
                  <Badge variant={kit.is_completed ? 'success' : 'warning'} className="ml-3 shrink-0">
                    {kit.is_completed ? 'Completed' : 'In Progress'}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Delete All */}
      <Dialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move All Kits to Trash?</DialogTitle>
            <DialogDescription>
              All {total} interview kit{total !== 1 ? 's' : ''} will be moved to Trash.
              You can recover them within 30 days from the Trash folder.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteAll(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? 'Moving...' : 'Move All to Trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
