import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Globe,
  FileText,
  ChevronRight,
  Filter,
  Calendar,
  Layers,
} from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { formatDateShort, SENIORITY_LEVELS } from '@/lib/utils';

export default function SharedKits() {
  const [search, setSearch] = useState('');
  const [seniority, setSeniority] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['interview', 'shared', search, seniority],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: 50, page: 1 });
      if (search) params.append('search', search);
      if (seniority && seniority !== 'all') params.append('seniority', seniority);
      const res = await api.get(`/interview/shared?${params}`);
      return res.data;
    },
    staleTime: 30_000,
  });

  const kits = data?.kits || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-100">
          <Globe className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Shared Kits</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Interview kits shared across your organisation
            {data?.total ? ` — ${data.total} kit${data.total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Search shared kits..."
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
      </div>

      {isError && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          Failed to load shared kits.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : kits.length === 0 ? (
        <div className="text-center py-20">
          <Globe className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-zinc-900">No shared kits yet</h3>
          <p className="text-sm text-zinc-500 mt-1">
            {search || seniority
              ? 'Try adjusting your filters.'
              : 'Open any completed kit and click the Private button to share it here.'}
          </p>
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
              <Card className="border-zinc-200 hover:border-emerald-200 transition-colors group">
                <CardContent className="p-4">
                  <Link to={`/kit/${kit.id}`} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate group-hover:text-emerald-700 transition-colors">
                            {kit.kit_title || 'Untitled Kit'}
                          </p>
                          <div className="flex flex-wrap gap-3 text-xs text-zinc-500 mt-1">
                            <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{kit.seniority_level}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDateShort(kit.created_at)}</span>
                            {Array.isArray(kit.tech_stack) && (
                              <span>{kit.tech_stack.slice(0, 3).join(', ')}{kit.tech_stack.length > 3 ? '...' : ''}</span>
                            )}
                            {kit.generation_seconds > 0 && (
                              <span className="text-zinc-400">
                                Generated in {kit.generation_seconds >= 60
                                  ? `${Math.floor(kit.generation_seconds / 60)}m ${kit.generation_seconds % 60}s`
                                  : `${kit.generation_seconds}s`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1 text-xs">
                            <Globe className="w-3 h-3" /> Shared
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-emerald-400 transition-colors" />
                        </div>
                      </div>
                      {Array.isArray(kit.tech_stack) && kit.tech_stack.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {kit.tech_stack.slice(0, 5).map((t) => (
                            <Badge key={t} variant="outline" className="text-xs px-1.5 py-0">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
