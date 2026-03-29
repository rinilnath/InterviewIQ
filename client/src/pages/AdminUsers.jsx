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

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);

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
                          <DropdownMenuItem onClick={() => setResetPasswordUser(u)}>
                            <KeyRound className="w-4 h-4 mr-2" />
                            Reset Password
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
