import { Routes, Route, Navigate } from 'react-router-dom';
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
        <Route path="search" element={<Search />} />
        <Route path="users" element={
          <ProtectedRoute roles={['admin']}>
            <Users />
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
