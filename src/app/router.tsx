import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireAdmin } from '@/auth/RequireAdmin';

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('@/pages/LoginPage').then((m) => ({ Component: m.LoginPage })),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, lazy: () => import('@/pages/OverviewPage').then((m) => ({ Component: m.OverviewPage })) },
          {
            path: 'devices',
            lazy: () => import('@/pages/devices/DeviceListPage').then((m) => ({ Component: m.DeviceListPage })),
          },
          {
            path: 'devices/:deviceId',
            lazy: () => import('@/pages/devices/DeviceDetailPage').then((m) => ({ Component: m.DeviceDetailPage })),
          },
          {
            path: 'devices/:deviceId/principal',
            element: <RequireAdmin />,
            children: [
              {
                index: true,
                lazy: () =>
                  import('@/pages/devices/DevicePrincipalPage').then((m) => ({ Component: m.DevicePrincipalPage })),
              },
            ],
          },
          {
            path: 'devices/:deviceId/sensors/:sensorId/policies',
            lazy: () =>
              import('@/pages/devices/SensorPoliciesPage').then((m) => ({ Component: m.SensorPoliciesPage })),
          },
          {
            path: 'devices/:deviceId/model-query',
            lazy: () => import('@/pages/devices/ModelQueryPage').then((m) => ({ Component: m.ModelQueryPage })),
          },
          {
            path: 'monitoring',
            lazy: () => import('@/pages/monitoring/LiveMonitoringPage').then((m) => ({ Component: m.LiveMonitoringPage })),
          },
          {
            path: 'analytics',
            lazy: () => import('@/pages/analytics/SmartAnalyticsPage').then((m) => ({ Component: m.SmartAnalyticsPage })),
          },
          {
            path: 'issues',
            lazy: () => import('@/pages/issues/IssueListPage').then((m) => ({ Component: m.IssueListPage })),
          },
          {
            path: 'issues/:issueId',
            lazy: () => import('@/pages/issues/IssueDetailPage').then((m) => ({ Component: m.IssueDetailPage })),
          },
          {
            path: 'categories',
            element: <RequireAdmin />,
            children: [
              {
                index: true,
                lazy: () => import('@/pages/categories/CategoriesPage').then((m) => ({ Component: m.CategoriesPage })),
              },
            ],
          },
          {
            path: 'knowledge-sharing',
            element: <RequireAdmin />,
            children: [
              {
                index: true,
                lazy: () =>
                  import('@/pages/knowledgeSharing/KnowledgeSharingPage').then((m) => ({
                    Component: m.KnowledgeSharingPage,
                  })),
              },
            ],
          },
          {
            path: 'training',
            lazy: () => import('@/pages/training/TrainingPage').then((m) => ({ Component: m.TrainingPage })),
          },
          {
            path: 'ollama-jobs',
            lazy: () => import('@/pages/ollama/OllamaJobsPage').then((m) => ({ Component: m.OllamaJobsPage })),
          },
          {
            path: 'admin/readers',
            element: <RequireAdmin />,
            children: [
              {
                index: true,
                lazy: () => import('@/pages/admin/ReadersPage').then((m) => ({ Component: m.ReadersPage })),
              },
            ],
          },
          {
            path: 'admin/settings',
            element: <RequireAdmin />,
            children: [
              {
                index: true,
                lazy: () => import('@/pages/admin/AdminSettingsPage').then((m) => ({ Component: m.AdminSettingsPage })),
              },
            ],
          },
          {
            path: 'status',
            lazy: () => import('@/pages/status/SystemStatusPage').then((m) => ({ Component: m.SystemStatusPage })),
          },
          { path: '*', lazy: () => import('@/pages/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })) },
        ],
      },
    ],
  },
]);
