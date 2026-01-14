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
  TrendingUp,
  ArrowUpRight,
  ArrowRight,
  Zap,
  Target,
  Activity,
  Package,
  Folder,
  Truck,
  PackageCheck
} from 'lucide-react';
import clsx from 'clsx';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts';

function StatCard({ title, value, icon: Icon, gradient, link, change }) {
  const content = (
    <div className="stat-card card-hover">
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-dark-500">{title}</p>
            <p className="mt-2 text-4xl font-bold text-dark-900">{value}</p>
            {change && (
              <div className="mt-2 flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4 text-success-500" />
                <span className="text-success-600 font-medium">{change}</span>
              </div>
            )}
          </div>
          <div className={clsx(
            'w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg',
            gradient
          )}>
            <Icon className="w-7 h-7 text-white" />
          </div>
        </div>
        {link && (
          <div className="mt-4 pt-4 border-t border-dark-100">
            <span className="text-sm font-medium text-primary-600 flex items-center gap-1 group-hover:gap-2 transition-all">
              View details
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (link) {
    return <Link to={link} className="group">{content}</Link>;
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

// RMA Aging Widget
function RmaAgingWidget({ data, total }) {
  if (!data || data.every(d => d.value === 0)) {
    return (
      <div className="card">
        <div className="px-6 py-5 border-b border-dark-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-dark-900">RMA Aging</h2>
              <p className="text-sm text-dark-500">Shipped RMAs by age</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center text-dark-500">
          <Package className="w-12 h-12 mx-auto mb-2 text-dark-300" />
          <p>No shipped RMAs to track</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">RMA Aging</h2>
            <p className="text-sm text-dark-500">{total} shipped RMAs</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {data.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-dark-600">{item.name}</span>
              <span className="font-bold text-dark-900 ml-auto">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Equipment Failures Widget
function EquipmentFailuresWidget({ equipment }) {
  if (!equipment || equipment.length === 0) {
    return (
      <div className="card">
        <div className="px-6 py-5 border-b border-dark-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-dark-900">Equipment Issues</h2>
              <p className="text-sm text-dark-500">Last 90 days</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center text-dark-500">
          <Monitor className="w-12 h-12 mx-auto mb-2 text-dark-300" />
          <p>No equipment issues in last 90 days</p>
        </div>
      </div>
    );
  }

  const chartData = equipment.slice(0, 6).map(e => ({
    name: e.name.length > 15 ? e.name.substring(0, 15) + '...' : e.name,
    fullName: e.name,
    issues: parseInt(e.failure_count)
  }));

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">Equipment Issues</h2>
            <p className="text-sm text-dark-500">Top issues in last 90 days</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white p-2 border rounded shadow-lg text-sm">
                      <p className="font-medium">{payload[0].payload.fullName}</p>
                      <p className="text-dark-600">{payload[0].value} issues</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="issues" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Common Issues Widget
function CommonIssuesWidget({ categories }) {
  if (!categories || categories.length === 0) {
    return (
      <div className="card">
        <div className="px-6 py-5 border-b border-dark-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
              <Folder className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-dark-900">Common Issues</h2>
              <p className="text-sm text-dark-500">This month</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center text-dark-500">
          <Folder className="w-12 h-12 mx-auto mb-2 text-dark-300" />
          <p>No issues this month</p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...categories.map(c => parseInt(c.count)));

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
            <Folder className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">Common Issues</h2>
            <p className="text-sm text-dark-500">Top categories this month</p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {categories.slice(0, 5).map((cat, idx) => {
          const percentage = (parseInt(cat.count) / maxCount) * 100;
          return (
            <div key={cat.id || idx} className="group">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-dark-700 font-medium">{cat.name}</span>
                <span className="text-dark-500">
                  <span className="font-bold text-dark-900">{cat.count}</span>
                  <span className="text-xs ml-1">({cat.open_count} open)</span>
                </span>
              </div>
              <div className="w-full bg-dark-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: cat.color || '#8b5cf6'
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Trends Widget
function TrendsWidget({ trends }) {
  if (!trends || trends.length === 0) {
    return (
      <div className="card lg:col-span-2">
        <div className="px-6 py-5 border-b border-dark-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-dark-900">Weekly Trends</h2>
              <p className="text-sm text-dark-500">Issues created vs resolved</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center text-dark-500">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-dark-300" />
          <p>Not enough data for trends</p>
        </div>
      </div>
    );
  }

  const chartData = trends.map(t => ({
    week: t.week,
    created: parseInt(t.created) || 0,
    resolved: parseInt(t.resolved) || 0
  })).reverse();

  return (
    <div className="card lg:col-span-2">
      <div className="px-6 py-5 border-b border-dark-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">Weekly Trends</h2>
            <p className="text-sm text-dark-500">Issues created vs resolved (8 weeks)</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#6b7280" />
            <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="created"
              name="Created"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ fill: '#f59e0b', r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Shipping Updates Widget
function ShippingUpdatesWidget({ updates }) {
  if (!updates || updates.length === 0) {
    return (
      <div className="card">
        <div className="px-6 py-5 border-b border-dark-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-dark-900">Shipping Updates</h2>
              <p className="text-sm text-dark-500">Recent RMA activity</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center text-dark-500">
          <Truck className="w-12 h-12 mx-auto mb-2 text-dark-300" />
          <p>No recent shipping updates</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'shipped': return <Truck className="w-4 h-4 text-accent-600" />;
      case 'received': return <PackageCheck className="w-4 h-4 text-success-600" />;
      case 'complete': return <CheckCircle className="w-4 h-4 text-success-600" />;
      default: return <Package className="w-4 h-4 text-dark-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'shipped': return 'bg-accent-50 text-accent-700 border-accent-200';
      case 'received': return 'bg-success-50 text-success-700 border-success-200';
      case 'complete': return 'bg-success-50 text-success-700 border-success-200';
      default: return 'bg-dark-50 text-dark-600 border-dark-200';
    }
  };

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">Shipping Updates</h2>
            <p className="text-sm text-dark-500">Recent RMA activity</p>
          </div>
        </div>
        <Link to="/rmas" className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="divide-y divide-dark-100 max-h-80 overflow-y-auto">
        {updates.map((update) => (
          <Link
            key={update.id}
            to={`/rmas/${update.id}`}
            className="flex items-center gap-3 px-6 py-3 hover:bg-primary-50/50 transition-colors group"
          >
            <div className="flex-shrink-0">
              {getStatusIcon(update.status)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-dark-900 truncate group-hover:text-primary-600 transition-colors text-sm">
                {update.item_name}
              </p>
              <p className="text-xs text-dark-500">
                <span className="font-mono">{update.rma_number}</span>
                {update.tracking_number && (
                  <span className="ml-2">• {update.tracking_number.substring(0, 12)}...</span>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={clsx('badge text-xs', getStatusColor(update.status))}>
                {update.status}
              </span>
              <span className="text-xs text-dark-400">
                {new Date(update.status_date).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
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

  // Widget queries (technician+ only)
  const { data: rmaAging } = useQuery({
    queryKey: ['rma-aging'],
    queryFn: async () => {
      const response = await dashboardApi.getRmaAging();
      return response.data;
    },
    enabled: user?.role !== 'viewer',
  });

  const { data: equipmentFailures } = useQuery({
    queryKey: ['equipment-failures'],
    queryFn: async () => {
      const response = await dashboardApi.getEquipmentFailures();
      return response.data;
    },
    enabled: user?.role !== 'viewer',
  });

  const { data: commonIssues } = useQuery({
    queryKey: ['common-issues'],
    queryFn: async () => {
      const response = await dashboardApi.getCommonIssues();
      return response.data;
    },
    enabled: user?.role !== 'viewer',
  });

  const { data: trends } = useQuery({
    queryKey: ['dashboard-trends'],
    queryFn: async () => {
      const response = await dashboardApi.getTrends();
      return response.data;
    },
    enabled: user?.role !== 'viewer',
  });

  const { data: shippingUpdates } = useQuery({
    queryKey: ['shipping-updates'],
    queryFn: async () => {
      const response = await dashboardApi.getShippingUpdates();
      return response.data;
    },
    enabled: user?.role !== 'viewer',
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  const statusCounts = {};
  stats?.stats?.issues_by_status?.forEach(s => {
    statusCounts[s.status] = parseInt(s.count);
  });

  const totalIssues = stats?.stats?.total_issues || 1;

  return (
    <div className="space-y-8 page-animate">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name}!</p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <Link to="/issues/new" className="btn btn-primary flex items-center gap-2">
            <Zap className="w-4 h-4" />
            New Issue
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Open Issues"
          value={stats?.stats?.open_issues || 0}
          icon={AlertCircle}
          gradient="bg-gradient-to-br from-warning-400 to-warning-600"
          link="/issues?status=open"
        />
        <StatCard
          title="Resolved This Week"
          value={stats?.stats?.resolved_this_week || 0}
          icon={CheckCircle}
          gradient="bg-gradient-to-br from-success-400 to-success-600"
          change="+12%"
        />
        <StatCard
          title="Total Manuals"
          value={stats?.stats?.total_manuals || 0}
          icon={BookOpen}
          gradient="bg-gradient-to-br from-primary-400 to-primary-600"
          link="/manuals"
        />
        <StatCard
          title="Equipment"
          value={stats?.stats?.total_equipment || 0}
          icon={Monitor}
          gradient="bg-gradient-to-br from-accent-400 to-accent-600"
          link="/equipment"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Assignments */}
        {user?.role !== 'viewer' && (
          <div className="card lg:col-span-2">
            <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-dark-900">My Assignments</h2>
                  <p className="text-sm text-dark-500">{assignments?.length || 0} active tasks</p>
                </div>
              </div>
              <Link to="/issues?assigned=me" className="btn btn-secondary text-sm">
                View All
              </Link>
            </div>
            <div className="divide-y divide-dark-100">
              {assignments?.length === 0 ? (
                <div className="empty-state py-12">
                  <CheckCircle className="empty-state-icon text-success-300" />
                  <h3 className="empty-state-title">All caught up!</h3>
                  <p className="empty-state-text">No active assignments</p>
                </div>
              ) : (
                assignments?.slice(0, 5).map((issue, idx) => (
                  <Link
                    key={issue.id}
                    to={`/issues/${issue.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-primary-50/50 transition-colors group"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className={clsx(
                      'w-2 h-2 rounded-full',
                      issue.priority === 'critical' && 'bg-danger-500',
                      issue.priority === 'high' && 'bg-warning-500',
                      issue.priority === 'medium' && 'bg-primary-500',
                      issue.priority === 'low' && 'bg-success-500'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-dark-900 truncate group-hover:text-primary-600 transition-colors">
                        {issue.title}
                      </p>
                      <p className="mt-0.5 text-sm text-dark-500">{issue.category_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={issue.status} />
                      <ArrowUpRight className="w-4 h-4 text-dark-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        {/* Issues by Status */}
        <div className="card">
          <div className="px-6 py-5 border-b border-dark-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dark-600 to-dark-800 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-dark-900">Status Overview</h2>
                <p className="text-sm text-dark-500">{totalIssues} total issues</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {[
              { status: 'open', label: 'Open', color: 'from-primary-400 to-primary-600' },
              { status: 'in_progress', label: 'In Progress', color: 'from-warning-400 to-warning-600' },
              { status: 'resolved', label: 'Resolved', color: 'from-success-400 to-success-600' },
              { status: 'closed', label: 'Closed', color: 'from-dark-400 to-dark-600' },
            ].map(({ status, label, color }) => {
              const count = statusCounts[status] || 0;
              const percentage = (count / totalIssues) * 100;
              return (
                <div key={status} className="group">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-dark-600 font-medium">{label}</span>
                    <span className="font-bold text-dark-900">{count}</span>
                  </div>
                  <div className="w-full bg-dark-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full bg-gradient-to-r transition-all duration-500', color)}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Shipping Updates (technician+ only) */}
      {user?.role !== 'viewer' && shippingUpdates?.updates?.length > 0 && (
        <ShippingUpdatesWidget updates={shippingUpdates?.updates} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Issues */}
        <div className="card">
          <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning-400 to-warning-600 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-dark-900">Recent Issues</h2>
            </div>
            <Link to="/issues" className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-dark-100">
            {stats?.recent_issues?.length === 0 ? (
              <div className="empty-state py-12">
                <AlertCircle className="empty-state-icon" />
                <h3 className="empty-state-title">No recent issues</h3>
                <p className="empty-state-text">Issues will appear here</p>
              </div>
            ) : (
              stats?.recent_issues?.map((issue, idx) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-primary-50/50 transition-colors group"
                >
                  <div className={clsx(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    issue.priority === 'critical' && 'bg-danger-500',
                    issue.priority === 'high' && 'bg-warning-500',
                    issue.priority === 'medium' && 'bg-primary-500',
                    issue.priority === 'low' && 'bg-success-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-900 truncate group-hover:text-primary-600 transition-colors">
                      {issue.title}
                    </p>
                    <p className="mt-0.5 text-sm text-dark-500">
                      by {issue.created_by_name} · {new Date(issue.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <PriorityBadge priority={issue.priority} />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recently Resolved */}
        <div className="card">
          <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success-400 to-success-600 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-dark-900">Recently Resolved</h2>
            </div>
          </div>
          <div className="divide-y divide-dark-100">
            {stats?.recently_resolved?.length === 0 ? (
              <div className="empty-state py-12">
                <Clock className="empty-state-icon" />
                <h3 className="empty-state-title">No resolved issues</h3>
                <p className="empty-state-text">Resolved issues will appear here</p>
              </div>
            ) : (
              stats?.recently_resolved?.map((issue, idx) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-success-50/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-success-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-success-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-900 truncate group-hover:text-success-600 transition-colors">
                      {issue.title}
                    </p>
                    <p className="text-sm text-dark-500">
                      {issue.assigned_to_name && `by ${issue.assigned_to_name} · `}
                      {new Date(issue.resolved_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-dark-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Analytics Widgets (technician+ only) */}
      {user?.role !== 'viewer' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <RmaAgingWidget data={rmaAging?.data} total={rmaAging?.total} />
          <EquipmentFailuresWidget equipment={equipmentFailures?.equipment} />
          <CommonIssuesWidget categories={commonIssues?.categories} />
          <TrendsWidget trends={trends?.trends} />
        </div>
      )}
    </div>
  );
}

export default Dashboard;
