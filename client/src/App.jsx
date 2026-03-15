import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/toaster';
import api from '@/lib/api';

import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import GenerateKit from '@/pages/GenerateKit';
import KitView from '@/pages/KitView';
import History from '@/pages/History';
import AdminUsers from '@/pages/AdminUsers';
import AdminDocuments from '@/pages/AdminDocuments';
import NotFound from '@/pages/NotFound';

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AdminRoute() {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return <FullPageLoader />;
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-sm">IQ</span>
        </div>
        <p className="text-sm text-zinc-500">Loading InterviewIQ...</p>
      </div>
    </div>
  );
}

function AuthInitializer({ children }) {
  const { isAuthenticated, setAuth, setLoading } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      api
        .get('/auth/me')
        .then((res) => {
          if (res.data.user) {
            setAuth(res.data.user, null);
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    }
  }, []);

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInitializer>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/generate" element={<GenerateKit />} />
            <Route path="/history" element={<History />} />
            <Route path="/kit/:id" element={<KitView />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/documents" element={<AdminDocuments />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </AuthInitializer>
    </BrowserRouter>
  );
}
