import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Issues from './pages/Issues';
import IssueDetail from './pages/IssueDetail';
import NewIssue from './pages/NewIssue';
import Manuals from './pages/Manuals';
import Equipment from './pages/Equipment';
import Search from './pages/Search';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Todos from './pages/Todos';
import RMAs from './pages/RMAs';
import RMADetail from './pages/RMADetail';
import Articles from './pages/Articles';
import ArticleDetail from './pages/ArticleDetail';
import ArticleEditor from './pages/ArticleEditor';
import ActivityLog from './pages/ActivityLog';

function ProtectedRoute({ children, roles }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Save current route to localStorage (for PWA resume)
  useEffect(() => {
    if (isAuthenticated && location.pathname !== '/login' && location.pathname !== '/') {
      localStorage.setItem('kb-last-route', location.pathname);
    }
  }, [location.pathname, isAuthenticated]);

  // Restore last route on app load (PWA resume)
  useEffect(() => {
    if (isAuthenticated) {
      const lastRoute = localStorage.getItem('kb-last-route');
      if (lastRoute && location.pathname === '/' || location.pathname === '/dashboard') {
        // Only restore if we're on the default route
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
          || window.navigator.standalone;
        if (isStandalone && lastRoute && lastRoute !== '/dashboard') {
          navigate(lastRoute, { replace: true });
        }
      }
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />}
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="issues" element={<Issues />} />
        <Route path="issues/new" element={
          <ProtectedRoute roles={['admin', 'technician']}>
            <NewIssue />
          </ProtectedRoute>
        } />
        <Route path="issues/:id" element={<IssueDetail />} />
        <Route path="manuals" element={<Manuals />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="todos" element={<Todos />} />
        <Route path="rmas" element={<RMAs />} />
        <Route path="rmas/:id" element={<RMADetail />} />
        <Route path="articles" element={<Articles />} />
        <Route path="articles/new" element={
          <ProtectedRoute roles={['admin', 'technician']}>
            <ArticleEditor />
          </ProtectedRoute>
        } />
        <Route path="articles/:id/edit" element={
          <ProtectedRoute roles={['admin', 'technician']}>
            <ArticleEditor />
          </ProtectedRoute>
        } />
        <Route path="articles/:slug" element={<ArticleDetail />} />
        <Route path="search" element={<Search />} />
        <Route path="users" element={
          <ProtectedRoute roles={['admin']}>
            <Users />
          </ProtectedRoute>
        } />
        <Route path="activity-log" element={
          <ProtectedRoute roles={['admin']}>
            <ActivityLog />
          </ProtectedRoute>
        } />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
