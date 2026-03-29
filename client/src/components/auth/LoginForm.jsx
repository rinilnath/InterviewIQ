import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export function LoginForm() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const res = await api.post('/auth/login', data);
      setAuth(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setServerError(err.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-zinc-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl border-zinc-200">
          <CardHeader className="pb-2 pt-8 px-8">
            <div className="flex flex-col items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg">
                <BrainCircuit className="w-7 h-7 text-white" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-zinc-900">InterviewIQ</h1>
                <p className="text-sm text-zinc-500 mt-1">AI-Powered Interview Management</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 rounded-md bg-rose-50 border border-rose-200 text-sm text-rose-700"
                >
                  {serverError}
                </motion.div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  {...register('email')}
                  className={errors.email ? 'border-rose-400 focus-visible:ring-rose-400' : ''}
                />
                {errors.email && (
                  <p className="text-xs text-rose-600">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  {...register('password')}
                  className={errors.password ? 'border-rose-400 focus-visible:ring-rose-400' : ''}
                />
                {errors.password && (
                  <p className="text-xs text-rose-600">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-zinc-400 mt-6">
              Contact your administrator if you need access.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
