import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

export function useAuth() {
  const { user, token, isAuthenticated, isLoading, setAuth, logout, setLoading } = useAuthStore();

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    retry: false,
    enabled: !isAuthenticated,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (data?.user) {
      setAuth(data.user, token);
    } else if (!queryLoading) {
      setLoading(false);
    }
  }, [data, queryLoading]);

  return { user, token, isAuthenticated, isLoading: isLoading || queryLoading };
}
