'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { setTokens, clearTokens } from '@/lib/auth';
import { useAuthStore } from '@/store/auth.store';
import type { LoginCredentials, RegisterData } from '@/types';

export function useCurrentUser() {
  const { setUser, setAuthenticated, setLoading } = useAuthStore();

  return useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: async () => {
      const res = await authApi.getProfile();
      setUser(res.data.data);
      setAuthenticated(true);
      setLoading(false);
      return res.data.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setUser, setAuthenticated, setRequires2FA } = useAuthStore();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (res) => {
      const data = res.data as any;
      // Backend returns { requiresTwoFactor: true } when 2FA is needed
      if (data?.data?.requiresTwoFactor || data?.requiresTwoFactor) {
        setRequires2FA(true);
        return;
      }
      // C2: accessToken in memory only, refreshToken is in httpOnly cookie (never in JS)
      const accessToken = data?.data?.accessToken;
      const user = data?.data?.user;
      if (accessToken) setTokens({ accessToken });
      if (user) {
        setUser(user);
        setAuthenticated(true);
        queryClient.setQueryData(['auth', 'profile'], user);
        toast.success('Bienvenue !');
        router.push('/dashboard');
      }
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Login failed');
    },
  });
}

export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: (data: RegisterData) => authApi.register(data),
    onSuccess: () => {
      toast.success('Account created! Please verify your email.');
      router.push('/auth/verify-email');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Registration failed');
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout } = useAuthStore();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearTokens();
      logout();
      queryClient.clear();
      router.push('/auth/login');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    onSuccess: () => {
      toast.success('Password reset email sent!');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to send reset email');
    },
  });
}

export function useResetPassword() {
  const router = useRouter();

  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
    onSuccess: () => {
      toast.success('Password reset successfully!');
      router.push('/auth/login');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message ?? 'Failed to reset password');
    },
  });
}

export function useSetup2FA() {
  return useMutation({
    mutationFn: () => authApi.setupTwoFactor(),
    onError: () => toast.error('Failed to setup 2FA'),
  });
}

export function useVerify2FA() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) => authApi.verifyTwoFactor(code),
    onSuccess: async () => {
      toast.success('Two-factor authentication enabled!');
      const res = await authApi.getProfile();
      setUser(res.data.data);
      queryClient.setQueryData(['auth', 'profile'], res.data.data);
      router.push('/dashboard');
    },
    onError: () => toast.error('Invalid 2FA code'),
  });
}
