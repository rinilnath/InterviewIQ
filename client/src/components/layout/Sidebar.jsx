import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  Users,
  BookOpen,
  LogOut,
  BrainCircuit,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/generate', label: 'Generate Kit', icon: PlusCircle },
  { to: '/history', label: 'History', icon: History },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];

const adminItems = [
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/documents', label: 'Knowledge Base', icon: BookOpen },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    queryClient.clear();
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-white border-r border-zinc-200 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-zinc-100">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-zinc-900 tracking-tight">InterviewIQ</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.to} item={item} isActive={isActive(item.to)} />
        ))}

        {user?.role === 'admin' && (
          <>
            <div className="px-3 pt-4 pb-1">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Admin</p>
            </div>
            {adminItems.map((item) => (
              <NavLink key={item.to} item={item} isActive={isActive(item.to)} />
            ))}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-zinc-100 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 truncate">{user?.name}</p>
            <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'} className="text-xs px-1.5 py-0 mt-0.5">
              {user?.role}
            </Badge>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

function NavLink({ item, isActive }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
      )}
    >
      <Icon className={cn('w-4 h-4', isActive ? 'text-indigo-600' : 'text-zinc-400')} />
      {item.label}
    </Link>
  );
}
