import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Trash2,
  FileText,
  PlusCircle,
  HardDrive,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort, formatFileSize, DOCUMENT_TYPES, DOC_TYPE_COLORS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const uploadSchema = z.object({
  label: z.string().min(2, 'Label must be at least 2 characters'),
  document_type: z.string().min(1, 'Please select a document type'),
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

export default function AdminDocuments() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/documents');
      return res.data.documents;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ label, document_type }) => {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('label', label);
      formData.append('document_type', document_type);
      const res = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['documents']);
      toast.success('Document uploaded', 'Knowledge base updated successfully.');
      setShowUpload(false);
      setSelectedFile(null);
      form.reset();
    },
    onError: (err) => toast.error('Upload failed', err.response?.data?.error || 'Failed to upload document.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['documents']);
      toast.success('Deleted', 'Document removed from knowledge base.');
      setDeleteId(null);
    },
    onError: () => toast.error('Delete failed', 'Could not delete document.'),
  });

  const form = useForm({
    resolver: zodResolver(uploadSchema),
  });

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setFileError('');
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors[0].code === 'file-too-large') {
        setFileError('File is too large. Maximum size is 10MB.');
      } else {
        setFileError('Invalid file type. Only PDF, DOCX, and TXT files are accepted.');
      }
      return;
    }
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const documents = data || [];
  const totalSize = documents.reduce((acc, d) => acc + (d.file_size_bytes || 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Knowledge Base</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <PlusCircle className="w-4 h-4" />
          Upload Document
        </Button>
      </div>

      {/* Storage indicator */}
      {documents.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
          <HardDrive className="w-4 h-4 text-zinc-400" />
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Storage used</span>
              <span>{formatFileSize(totalSize)}</span>
            </div>
            <Progress value={Math.min((totalSize / (500 * 1024 * 1024)) * 100, 100)} className="h-1.5" />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
          <h3 className="text-base font-medium text-zinc-900">No documents yet</h3>
          <p className="text-sm text-zinc-500 mt-1 mb-4">Upload documents to build the knowledge base.</p>
          <Button onClick={() => setShowUpload(true)} className="bg-indigo-600 hover:bg-indigo-700">
            Upload First Document
          </Button>
        </div>
      ) : (
        <Card className="border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Label</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">File</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Size</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Uploaded By</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, i) => (
                  <motion.tr
                    key={doc.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="font-medium text-zinc-900">{doc.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DOC_TYPE_COLORS[doc.document_type] || 'bg-zinc-100 text-zinc-600'}`}>
                        {DOCUMENT_TYPES.find((d) => d.value === doc.document_type)?.label || doc.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      <div>
                        <p className="truncate max-w-[200px]">{doc.original_name}</p>
                        <p className="text-xs text-zinc-400 uppercase">{doc.file_type}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatFileSize(doc.file_size_bytes)}</td>
                    <td className="px-4 py-3 text-zinc-500">{doc.users?.name || '—'}</td>
                    <td className="px-4 py-3 text-zinc-500">{formatDateShort(doc.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteId(doc.id)}
                          className="text-zinc-300 hover:text-rose-500 transition-colors p-1 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Upload Sheet */}
      <Sheet open={showUpload} onOpenChange={(o) => { setShowUpload(o); if (!o) { setSelectedFile(null); setFileError(''); form.reset(); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Upload Document</SheetTitle>
            <SheetDescription>Add a document to the knowledge base. PDF, DOCX, or TXT. Max 10MB.</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={form.handleSubmit((d) => uploadMutation.mutate(d))}
            className="space-y-4 mt-6"
          >
            {/* Dropzone */}
            <div>
              <Label className="mb-2 block">File</Label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-indigo-400 bg-indigo-50'
                    : selectedFile
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'
                }`}
              >
                <input {...getInputProps()} />
                {selectedFile ? (
                  <div>
                    <File className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-zinc-900">{selectedFile.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                    <p className="text-sm text-zinc-600">
                      {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">PDF, DOCX, TXT — max 10MB</p>
                  </div>
                )}
              </div>
              {fileError && <p className="text-xs text-rose-600 mt-1">{fileError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input placeholder="E.g., React Interview Questions 2024" {...form.register('label')} />
              {form.formState.errors.label && (
                <p className="text-xs text-rose-600">{form.formState.errors.label.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <Controller
                name="document_type"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={form.formState.errors.document_type ? 'border-rose-400' : ''}>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((dt) => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.document_type && (
                <p className="text-xs text-rose-600">{form.formState.errors.document_type.message}</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowUpload(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                disabled={uploadMutation.isPending || !selectedFile}
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              This document will be permanently removed from the knowledge base.
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
