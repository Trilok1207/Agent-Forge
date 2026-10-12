import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { NotificationsProvider } from '@/state/NotificationsContext';
import { ProjectsProvider } from '@/state/ProjectsContext';
import { AppLayout } from './components/AppLayout';
import { AboutPage } from './pages/AboutPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectPage } from './pages/ProjectPage';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/projects/:projectId', element: <ProjectPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <NotificationsProvider>
      <ProjectsProvider>
        <RouterProvider router={router} />
      </ProjectsProvider>
    </NotificationsProvider>
  );
}
