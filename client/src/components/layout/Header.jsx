import { useLocation, Link } from 'react-router-dom';
import { LogOut, BrainCircuit, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import api from '@/lib/api';
import { useNavigate } from 'react-router-dom';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/generate': 'Generate Kit',
  '/history': 'Interview History',
  '/admin/users': 'User Management',
  '/admin/documents': 'Knowledge Base',
};

function getBreadcrumb(pathname) {
  if (pathname.startsWith('/kit/')) return [{ label: 'History', to: '/history' }, { label: 'Kit View' }];
  const label = PAGE_TITLES[pathname];
  if (!label) return [];
  return [{ label }];
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const title = PAGE_TITLES[location.pathname] || 'InterviewIQ';
  const breadcrumbs = getBreadcrumb(location.pathname);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 border-b border-zinc-200 bg-white flex items-center justify-between px-6 shrink-0">
      {/* Left: title + breadcrumb */}
      <div>
        <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
        {breadcrumbs.length > 1 && (
          <nav className="flex items-center gap-1 text-xs text-zinc-500">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>/</span>}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-zinc-700">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-zinc-400">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Right: user menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 rounded-full gap-2 px-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-zinc-700 hidden sm:inline">{user?.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div>
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
