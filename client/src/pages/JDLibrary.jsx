import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PlusCircle, Trash2, FileText, Library, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const schema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  role: z.string().min(1, 'Role is required'),
  technologies: z.string().optional(),
  content: z.string().min(50, 'JD content must be at least 50 characters'),
});

export default function JDLibrary() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jd-library'],
    queryFn: async () => (await api.get('/jd')).data.jds,
    staleTime: 60_000,
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });
  const contentValue = watch('content', '');

  const addMutation = useMutation({
    mutationFn: (values) => api.post('/jd', {
      title: values.title,
      role: values.role,
      technologies: values.technologies
        ? values.technologies.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
      content: values.content,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['jd-library']);
      toast.success('JD added', 'Job description saved to library.');
      setShowAdd(false);
      reset();
    },
    onError: (err) => toast.error('Save failed', err.response?.data?.error || 'Could not save JD.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/jd/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['jd-library']);
      toast.success('Deleted', 'JD removed from library.');
      setDeleteId(null);
    },
    onError: (err) => toast.error('Delete failed', err.response?.data?.error || 'Could not delete JD.'),
  });

  // Read a plain-text file and paste its contents into the content field
  const handleFileRead = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('text/') && !file.name.endsWith('.txt')) {
      toast.error('Unsupported file', 'Only plain text (.txt) files can be imported.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setValue('content', evt.target.result, { shouldValidate: true });
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [setValue]);

  const jds = data || [];

  const filtered = search.trim()
    ? jds.filter((jd) => {
        const q = search.toLowerCase();
        return (
          jd.title.toLowerCase().includes(q) ||
          jd.role.toLowerCase().includes(q) ||
          (jd.technologies || []).some((t) => t.toLowerCase().includes(q))
        );
      })
    : jds;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">JD Library</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {jds.length} job description{jds.length !== 1 ? 's' : ''} — reuse JDs when generating interview kits
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <PlusCircle className="w-4 h-4" />
          Add JD
        </Button>
      </div>

      {/* Search */}
      {jds.length > 0 && (
        <Input
          placeholder="Search by title, role or technology..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : jds.length === 0 ? (
        <div className="text-center py-20 border border-zinc-100 rounded-2xl bg-zinc-50">
          <Library className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-zinc-900">No JDs yet</h3>
          <p className="text-sm text-zinc-500 mt-1 mb-4">
            Add job descriptions to quickly reuse them when generating interview kits.
          </p>
          <Button onClick={() => setShowAdd(true)} className="bg-indigo-600 hover:bg-indigo-700">
            Add First JD
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 py-10 text-center">No JDs match your search.</p>
      ) : (
        <Card className="border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Technologies</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Uploaded By</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-zinc-500 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((jd, i) => {
                  const canDelete = user?.role === 'admin' || jd.uploaded_by === user?.id;
                  return (
                    <motion.tr
                      key={jd.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-zinc-300 shrink-0" />
                          <span className="font-medium text-zinc-900 max-w-[180px] truncate" title={jd.title}>
                            {jd.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 max-w-[140px] truncate" title={jd.role}>
                        {jd.role}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(jd.technologies || []).slice(0, 4).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs px-1.5 py-0">
                              {t}
                            </Badge>
                          ))}
                          {(jd.technologies || []).length > 4 && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              +{jd.technologies.length - 4}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {jd.uploaded_by_name}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                        {formatDateShort(jd.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canDelete && (
                          <button
                            onClick={() => setDeleteId(jd.id)}
                            className="text-zinc-300 hover:text-rose-500 transition-colors p-1 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add JD Sheet */}
      <Sheet
        open={showAdd}
        onOpenChange={(o) => { setShowAdd(o); if (!o) reset(); }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Job Description</SheetTitle>
            <SheetDescription>
              Save a JD to the library so it can be quickly reused when generating kits.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit((d) => addMutation.mutate(d))} className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Title <span className="text-rose-500">*</span></Label>
              <Input
                placeholder="e.g. Senior Backend Engineer — Fintech"
                className={errors.title ? 'border-rose-400' : ''}
                {...register('title')}
              />
              {errors.title && <p className="text-xs text-rose-600">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Role <span className="text-rose-500">*</span></Label>
              <Input
                placeholder="e.g. Backend Engineer"
                className={errors.role ? 'border-rose-400' : ''}
                {...register('role')}
              />
              {errors.role && <p className="text-xs text-rose-600">{errors.role.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Core Technologies</Label>
              <Input
                placeholder="e.g. Node.js, PostgreSQL, AWS (comma-separated)"
                {...register('technologies')}
              />
              <p className="text-xs text-zinc-400">Used to match this JD when generating a kit</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>JD Content <span className="text-rose-500">*</span></Label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Import .txt file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={handleFileRead}
                />
              </div>
              <Textarea
                placeholder="Paste the full job description here..."
                className={`min-h-[200px] text-sm ${errors.content ? 'border-rose-400' : ''}`}
                {...register('content')}
              />
              <div className="flex items-center justify-between">
                {errors.content
                  ? <p className="text-xs text-rose-600">{errors.content.message}</p>
                  : <span />
                }
                <span className="text-xs text-zinc-400 ml-auto">
                  {contentValue?.length || 0} chars
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? 'Saving...' : 'Save to Library'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete JD</DialogTitle>
            <DialogDescription>
              This job description will be permanently removed from the library.
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
