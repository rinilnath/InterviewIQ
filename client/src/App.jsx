import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/useToast';
import api from '@/lib/api';
import { useGeneratingKitsStore } from '@/store/generatingKitsStore';

import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import GenerateKit from '@/pages/GenerateKit';
import KitView from '@/pages/KitView';
import History from '@/pages/History';
import Trash from '@/pages/Trash';
import SharedKits from '@/pages/SharedKits';
import Account from '@/pages/Account';
import AdminUsers from '@/pages/AdminUsers';
import AdminDocuments from '@/pages/AdminDocuments';
import NotFound from '@/pages/NotFound';

// Polls every 4 s for kits the user started but may have navigated away from.
// Fires a toast (with nav link in description) when any kit completes or fails.
function KitCompletionWatcher() {
  const { kits, remove } = useGeneratingKitsStore();
  const navigate = useNavigate();
  const kitIds = Object.keys(kits);
  // Keep a stable ref to avoid stale closures in the interval
  const kitsRef = useRef(kits);
  useEffect(() => { kitsRef.current = kits; }, [kits]);

  useEffect(() => {
    if (kitIds.length === 0) return;

    const interval = setInterval(async () => {
      const current = kitsRef.current;
      for (const kitId of Object.keys(current)) {
        try {
          const res = await api.get(`/interview/${kitId}`);
          const kit = res.data.kit;
          if (kit.status === 'completed') {
            remove(kitId);
            toast.success(
              'Interview kit ready!',
              `"${kit.kit_title}" has been generated.`,
            );
            // Small delay so toast renders before potential navigation
            setTimeout(() => navigate(`/kit/${kitId}`), 300);
          } else if (kit.status === 'failed') {
            remove(kitId);
            toast.error('Generation failed', kit.error_message || 'Please try regenerating.');
          }
        } catch (_) {
          // Network blip — will retry on next tick
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [kitIds.length]); // re-run only when kit count changes

  return null;
}

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <KitCompletionWatcher />
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
          if (res.data.user) setAuth(res.data.user, null);
          else setLoading(false);
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
            <Route path="/trash" element={<Trash />} />
            <Route path="/shared" element={<SharedKits />} />
            <Route path="/account" element={<Account />} />
            <Route path="/kit/:id" element={<KitView />} />
            <Route path="/knowledge-base" element={<AdminDocuments />} />
            <Route path="/admin/documents" element={<Navigate to="/knowledge-base" replace />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin/users" element={<AdminUsers />} />
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
