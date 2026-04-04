import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PlusCircle,
  MoreVertical,
  UserCheck,
  UserX,
  KeyRound,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { formatDateShort } from '@/lib/utils';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'user']),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const TIER_LABELS = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };
const TIER_COLORS = {
  free:       'bg-zinc-100 text-zinc-600',
  pro:        'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-violet-100 text-violet-700',
};

function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

// ─── Deletion Requests ────────────────────────────────────────────────────────

function DeletionRequests() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'deletion-requests'],
    queryFn:  async () => (await api.get('/admin/deletion-requests')).data,
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/deletion-requests/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin', 'deletion-requests']);
      queryClient.invalidateQueries(['admin', 'users']);
      toast.success('Erased', 'User account and all data have been permanently deleted.');
    },
    onError: (err) => toast.error('Failed', err.response?.data?.error || 'Could not process request.'),
  });

  const requests = data?.requests || [];

  if (isLoading || requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-900">Deletion Requests</h3>
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold">{requests.length}</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <Card className="border-rose-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700">
            Approving will immediately and permanently erase the user's account and all their data. This cannot be undone.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-4 py-3 font-medium text-zinc-500">User</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500">Requested</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{r.users?.name}</p>
                    <p className="text-xs text-zinc-400">{r.users?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 italic max-w-[200px] truncate" title={r.reason}>
                    {r.reason || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-xs"
                      onClick={() => approveMutation.mutate(r.id)}
                      disabled={approveMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3" /> Erase Account
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Email Logs ───────────────────────────────────────────────────────────────

function EmailLogs() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['email', 'logs'],
    queryFn:  async () => (await api.get('/email/logs?limit=100')).data,
    staleTime: 30_000,
  });

  const logs = data?.logs || [];

  const typeLabel  = { welcome: 'Welcome', support: 'Support' };
  const typeBadge  = { welcome: 'bg-indigo-100 text-indigo-700', support: 'bg-zinc-100 text-zinc-600' };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-900">Email Logs</h3>
          <span className="text-xs text-zinc-400">{logs.length} recent</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="h-24 rounded-xl bg-zinc-50 border border-zinc-100 animate-pulse" />
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 border border-zinc-100 rounded-xl bg-zinc-50">
          No emails sent yet
        </div>
      ) : (
        <Card className="border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Recipient</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Subject</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Sent</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge[log.email_type] || 'bg-zinc-100 text-zinc-600'}`}>
                        {typeLabel[log.email_type] || log.email_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-zinc-900 font-medium">{log.recipient_name || '—'}</p>
                      <p className="text-xs text-zinc-400">{log.recipient_email}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 max-w-[200px] truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === 'failed' ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-rose-600" title={log.error}>
                          <AlertTriangle className="w-3 h-3" /> Failed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> Sent
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [subscriptionUser, setSubscriptionUser] = useState(null);
  const [subTier, setSubTier] = useState('free');
  const [subExpiry, setSubExpiry] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [requestsTab, setRequestsTab] = useState('pending'); // 'pending' | 'rejected'
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await api.get('/admin/users');
      return res.data.users;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/admin/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin', 'users']);
      toast.success('User created', 'New user account has been created.');
      setShowCreate(false);
      createForm.reset();
    },
    onError: (err) => toast.error('Create failed', err.response?.data?.error || 'Failed to create user.'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/admin/users/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin', 'users']);
      toast.success('Updated', 'User status updated.');
    },
    onError: () => toast.error('Update failed', 'Could not update user status.'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }) => api.post(`/admin/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => {
      toast.success('Password reset', 'Password has been reset successfully.');
      setResetPasswordUser(null);
      resetForm.reset();
    },
    onError: () => toast.error('Reset failed', 'Could not reset password.'),
  });

  const { data: upgradeRequests } = useQuery({
    queryKey: ['payment', 'requests', 'pending'],
    queryFn: async () => (await api.get('/payment/requests?status=pending')).data.requests,
    refetchInterval: 60_000,
  });

  const { data: rejectedRequests } = useQuery({
    queryKey: ['payment', 'requests', 'rejected'],
    queryFn: async () => (await api.get('/payment/requests?status=rejected')).data.requests,
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id }) => api.patch(`/payment/requests/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries(['payment', 'requests']);
      queryClient.invalidateQueries(['admin', 'users']);
      setRequestsTab('pending');
      toast.success('Approved', 'User plan has been upgraded.');
    },
    onError: (err) => toast.error('Approval failed', err.response?.data?.error || 'Please try again.'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/payment/requests/${id}/reject`, { adminNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries(['payment', 'requests']);
      setRejectTarget(null);
      setRejectNote('');
      toast.success('Rejected', 'Request has been rejected with a note.');
    },
    onError: (err) => toast.error('Rejection failed', err.response?.data?.error || 'Please try again.'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin', 'users']);
      toast.success('User deleted', 'User and all their data have been permanently removed.');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error('Delete failed', err.response?.data?.error || 'Could not delete user.'),
  });

  const subscriptionMutation = useMutation({
    mutationFn: ({ id, tier, expiry }) =>
      api.patch(`/admin/users/${id}/subscription`, {
        subscription_tier: tier,
        subscription_expires_at: expiry || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin', 'users']);
      toast.success('Subscription updated', 'User plan has been changed.');
      setSubscriptionUser(null);
    },
    onError: (err) => toast.error('Update failed', err.response?.data?.error || 'Could not update subscription.'),
  });

  const createForm = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'user' },
  });

  const resetForm = useForm({
    resolver: zodResolver(resetPasswordSchema),
  });

  const users = data || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">User Management</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <PlusCircle className="w-4 h-4" />
          Create User
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <Card className="border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-zinc-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        {u.role === 'admin' && <Shield className="w-3 h-3 mr-1" />}
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-zinc-400">Unlimited</span>
                      ) : (
                        <div>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TIER_COLORS[u.subscription_tier] || TIER_COLORS.free}`}>
                            <Zap className="w-2.5 h-2.5" />
                            {TIER_LABELS[u.subscription_tier] || 'Free'}
                          </span>
                          {u.subscription_expires_at && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                              Exp {new Date(u.subscription_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: u.id, is_active: checked })
                          }
                          className="scale-90"
                        />
                        <span className={`text-xs ${u.is_active ? 'text-emerald-600' : 'text-zinc-400'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatDateShort(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => toggleActiveMutation.mutate({ id: u.id, is_active: !u.is_active })}
                          >
                            {u.is_active ? (
                              <><UserX className="w-4 h-4 mr-2 text-rose-500" />Deactivate</>
                            ) : (
                              <><UserCheck className="w-4 h-4 mr-2 text-emerald-500" />Activate</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.role !== 'admin' && (
                            <DropdownMenuItem onClick={() => {
                              setSubscriptionUser(u);
                              setSubTier(u.subscription_tier || 'free');
                              setSubExpiry(u.subscription_expires_at ? u.subscription_expires_at.slice(0, 10) : '');
                            }}>
                              <Zap className="w-4 h-4 mr-2 text-indigo-500" />
                              Set Plan
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setResetPasswordUser(u)}>
                            <KeyRound className="w-4 h-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create User Sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create New User</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))}
            className="space-y-4 mt-6"
          >
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input placeholder="Jane Smith" {...createForm.register('name')} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-rose-600">{createForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input type="email" placeholder="jane@company.com" {...createForm.register('email')} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-rose-600">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input type="password" placeholder="Min 6 characters" {...createForm.register('password')} />
              {createForm.formState.errors.password && (
                <p className="text-xs text-rose-600">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Controller
                name="role"
                control={createForm.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Payment Requests Panel */}
      {((upgradeRequests?.length > 0) || (rejectedRequests?.length > 0)) && (
        <div className="space-y-3">
          {/* Tab header */}
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-zinc-900">Payment Requests</h3>
            <div className="flex rounded-lg border border-zinc-200 overflow-hidden bg-zinc-50 p-0.5 gap-0.5">
              <button
                onClick={() => setRequestsTab('pending')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  requestsTab === 'pending'
                    ? 'bg-white shadow-sm text-zinc-900 border border-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <Clock className="w-3 h-3" />
                Pending
                {(upgradeRequests?.length > 0) && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    {upgradeRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRequestsTab('rejected')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  requestsTab === 'rejected'
                    ? 'bg-white shadow-sm text-zinc-900 border border-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <XCircle className="w-3 h-3" />
                Rejected
                {(rejectedRequests?.length > 0) && (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold">
                    {rejectedRequests.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Pending tab */}
          {requestsTab === 'pending' && (
            upgradeRequests?.length > 0 ? (
              <Card className="border-amber-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-amber-100 bg-amber-50">
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">User</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Plan</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Ref</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Method</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Requested</th>
                        <th className="text-right px-4 py-3 font-medium text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upgradeRequests.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-900">{r.users?.name}</p>
                            <p className="text-xs text-zinc-400">{r.users?.email}</p>
                          </td>
                          <td className="px-4 py-3 capitalize">
                            <span className="font-medium">{r.requested_tier}</span>
                            <span className="text-zinc-400"> · {r.plan_period}</span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-zinc-900">₹{fmt(r.amount_inr)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-600">{r.utr_number}</td>
                          <td className="px-4 py-3 capitalize text-zinc-500 text-xs">{r.payment_method.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs">{formatDateShort(r.created_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs"
                                onClick={() => approveMutation.mutate({ id: r.id })}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-200 text-rose-600 hover:bg-rose-50 h-7 px-2 text-xs"
                                onClick={() => { setRejectTarget(r); setRejectNote(''); }}
                              >
                                <XCircle className="w-3.5 h-3.5" /> Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <div className="text-center py-8 text-sm text-zinc-400 border border-zinc-100 rounded-xl bg-zinc-50">
                No pending requests
              </div>
            )
          )}

          {/* Rejected tab */}
          {requestsTab === 'rejected' && (
            rejectedRequests?.length > 0 ? (
              <Card className="border-rose-100">
                <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex items-start gap-2">
                  <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700">
                    If a payment was rejected by mistake, click <strong>Re-approve</strong> to instantly activate the user's plan — no repayment needed.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50">
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">User</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Plan</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Rejection reason</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">Rejected on</th>
                        <th className="text-right px-4 py-3 font-medium text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedRequests.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-900">{r.users?.name}</p>
                            <p className="text-xs text-zinc-400">{r.users?.email}</p>
                          </td>
                          <td className="px-4 py-3 capitalize">
                            <span className="font-medium">{r.requested_tier}</span>
                            <span className="text-zinc-400"> · {r.plan_period}</span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-zinc-900">₹{fmt(r.amount_inr)}</td>
                          <td className="px-4 py-3 text-xs text-rose-600 italic max-w-[200px] truncate" title={r.admin_note}>
                            {r.admin_note || '—'}
                          </td>
                          <td className="px-4 py-3 text-zinc-500 text-xs">{formatDateShort(r.reviewed_at || r.created_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2 text-xs"
                              onClick={() => approveMutation.mutate({ id: r.id })}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Re-approve
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <div className="text-center py-8 text-sm text-zinc-400 border border-zinc-100 rounded-xl bg-zinc-50">
                No rejected requests
              </div>
            )
          )}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Upgrade Request</DialogTitle>
            <DialogDescription>
              Provide a reason — this will be shown to the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason <span className="text-rose-500">*</span></Label>
            <Input
              placeholder="e.g. UTR not found, wrong amount, duplicate request"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: rejectTarget?.id, note: rejectNote })}
              disabled={!rejectNote.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Plan Dialog */}
      <Dialog open={!!subscriptionUser} onOpenChange={(o) => !o && setSubscriptionUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Plan — {subscriptionUser?.name}</DialogTitle>
            <DialogDescription>
              Free: 5 kits/mo · Pro: 50 kits/mo · Enterprise: 200 kits/mo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Subscription Plan</Label>
              <Select value={subTier} onValueChange={setSubTier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free — 5 kits / month</SelectItem>
                  <SelectItem value="pro">Pro — 50 kits / month</SelectItem>
                  <SelectItem value="enterprise">Enterprise — 200 kits / month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {subTier !== 'free' && (
              <div className="space-y-1.5">
                <Label>Expiry Date <span className="text-zinc-400 font-normal">(leave blank = never expires)</span></Label>
                <Input
                  type="date"
                  value={subExpiry}
                  onChange={(e) => setSubExpiry(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscriptionUser(null)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => subscriptionMutation.mutate({ id: subscriptionUser?.id, tier: subTier, expiry: subExpiry })}
              disabled={subscriptionMutation.isPending}
            >
              {subscriptionMutation.isPending ? 'Saving...' : 'Save Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deletion Requests */}
      <DeletionRequests />

      {/* Email Logs */}
      <EmailLogs />

      {/* Delete User Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-600">Delete User — {deleteTarget?.name}</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data (kits, documents, payment requests, emails). This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteUserMutation.mutate(deleteTarget?.id)}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(o) => !o && setResetPasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordUser?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={resetForm.handleSubmit((d) => resetPasswordMutation.mutate({ id: resetPasswordUser?.id, ...d }))}>
            <div className="space-y-1.5 mb-4">
              <Label>New Password</Label>
              <Input type="password" placeholder="Min 6 characters" {...resetForm.register('newPassword')} />
              {resetForm.formState.errors.newPassword && (
                <p className="text-xs text-rose-600">{resetForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetPasswordUser(null)}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
