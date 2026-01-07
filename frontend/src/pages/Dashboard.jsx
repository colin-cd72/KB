import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  BookOpen,
  Monitor,
  Users,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import clsx from 'clsx';

function StatCard({ title, value, icon: Icon, color, link }) {
  const content = (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={clsx('p-3 rounded-lg', color)}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  if (link) {
    return <Link to={link}>{content}</Link>;
  }
  return content;
}

function PriorityBadge({ priority }) {
  return (
    <span className={`badge badge-${priority}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`badge status-${status}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function Dashboard() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await dashboardApi.getStats();
      return response.data;
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: async () => {
      const response = await dashboardApi.getAssignments();
      return response.data.assignments;
    },
    enabled: user?.role !== 'viewer',
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statusCounts = {};
  stats?.stats?.issues_by_status?.forEach(s => {
    statusCounts[s.status] = parseInt(s.count);
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">Welcome back, {user?.name}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Open Issues"
          value={stats?.stats?.open_issues || 0}
          icon={AlertCircle}
          color="bg-yellow-500"
          link="/issues?status=open"
        />
        <StatCard
          title="Resolved This Week"
          value={stats?.stats?.resolved_this_week || 0}
          icon={CheckCircle}
          color="bg-green-500"
        />
        <StatCard
          title="Total Manuals"
          value={stats?.stats?.total_manuals || 0}
          icon={BookOpen}
          color="bg-blue-500"
          link="/manuals"
        />
        <StatCard
          title="Equipment"
          value={stats?.stats?.total_equipment || 0}
          icon={Monitor}
          color="bg-purple-500"
          link="/equipment"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Assignments */}
        {user?.role !== 'viewer' && (
          <div className="card">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">My Assignments</h2>
            </div>
            <div className="divide-y">
              {assignments?.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>No active assignments</p>
                </div>
              ) : (
                assignments?.slice(0, 5).map((issue) => (
                  <Link
                    key={issue.id}
                    to={`/issues/${issue.id}`}
                    className="block px-6 py-4 hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{issue.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{issue.category_name}</p>
                      </div>
                      <div className="ml-4 flex flex-col items-end gap-1">
                        <PriorityBadge priority={issue.priority} />
                        <StatusBadge status={issue.status} />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
            {assignments?.length > 5 && (
              <div className="px-6 py-3 border-t">
                <Link to="/issues?assigned=me" className="text-sm text-primary-600 hover:text-primary-700">
                  View all {assignments.length} assignments
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Recent Issues */}
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Issues</h2>
            <Link to="/issues" className="text-sm text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {stats?.recent_issues?.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No recent issues</p>
              </div>
            ) : (
              stats?.recent_issues?.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.id}`}
                  className="block px-6 py-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{issue.title}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        by {issue.created_by_name} · {new Date(issue.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-4">
                      <PriorityBadge priority={issue.priority} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recently Resolved */}
        <div className="card">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Recently Resolved</h2>
          </div>
          <div className="divide-y">
            {stats?.recently_resolved?.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No recently resolved issues</p>
              </div>
            ) : (
              stats?.recently_resolved?.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.id}`}
                  className="block px-6 py-4 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{issue.title}</p>
                      <p className="text-sm text-gray-500">
                        {issue.assigned_to_name && `by ${issue.assigned_to_name} · `}
                        {new Date(issue.resolved_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Issues by Status */}
        <div className="card">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Issues by Status</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {[
                { status: 'open', label: 'Open', color: 'bg-blue-500' },
                { status: 'in_progress', label: 'In Progress', color: 'bg-yellow-500' },
                { status: 'resolved', label: 'Resolved', color: 'bg-green-500' },
                { status: 'closed', label: 'Closed', color: 'bg-gray-500' },
              ].map(({ status, label, color }) => (
                <div key={status}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-medium">{statusCounts[status] || 0}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={clsx('h-2 rounded-full', color)}
                      style={{
                        width: `${((statusCounts[status] || 0) / (stats?.stats?.total_issues || 1)) * 100}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
