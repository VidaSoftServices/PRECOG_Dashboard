import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '@/api/queryClient';
import { AuthProvider } from '@/auth/AuthContext';
import { AppThemeProvider } from '@/theme/ThemeContext';
import { AppToastProvider } from '@/components/ToastProvider';
import { router } from '@/app/router';

export default function App() {
  return (
    <AppThemeProvider>
      <AppToastProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </AppToastProvider>
    </AppThemeProvider>
  );
}
