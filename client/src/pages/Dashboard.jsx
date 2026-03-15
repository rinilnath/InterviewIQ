import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  Clock,
  Users,
  BookOpen,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { formatDateShort } from '@/lib/utils';

const containerVariants = {
  animate: { transition: { staggerChildren: 0.07 } },
};
const cardVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const { user } = useAuthStore();

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

  const kits = historyData?.kits || [];
  const total = historyData?.total || 0;
  const completed = kits.filter((k) => k.is_completed).length;
  const pending = kits.filter((k) => !k.is_completed).length;

  const stats = [
    {
      label: 'Total Kits Generated',
      value: isLoading ? '—' : total,
      icon: FileText,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: 'Completed Interviews',
      value: isLoading ? '—' : completed,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Pending Reviews',
      value: isLoading ? '—' : pending,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    ...(user?.role === 'admin'
      ? [
          {
            label: 'Total Users',
            value: adminLoading ? '—' : adminData?.userCount,
            icon: Users,
            color: 'text-violet-600',
            bg: 'bg-violet-50',
          },
          {
            label: 'KB Documents',
            value: adminLoading ? '—' : adminData?.docCount,
            icon: BookOpen,
            color: 'text-sky-600',
            bg: 'bg-sky-50',
          },
        ]
      : []),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">Here's your interview management overview.</p>
        </div>
        <Button asChild className="hidden sm:flex bg-indigo-600 hover:bg-indigo-700">
          <Link to="/generate">
            <PlusCircle className="w-4 h-4" />
            Generate Kit
          </Link>
        </Button>
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
            <Link to="/history">
              View all
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
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
    </div>
  );
}
