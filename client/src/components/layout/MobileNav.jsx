import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, History, Users, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

export function MobileNav() {
  const location = useLocation();
  const { user } = useAuthStore();

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/generate', label: 'Generate', icon: PlusCircle },
    { to: '/history', label: 'History', icon: History },
    ...(user?.role === 'admin'
      ? [
          { to: '/admin/users', label: 'Users', icon: Users },
          { to: '/admin/documents', label: 'KB', icon: BookOpen },
        ]
      : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 z-40">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-3 min-w-[44px] min-h-[56px] justify-center transition-colors',
                isActive ? 'text-indigo-600' : 'text-zinc-500'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
