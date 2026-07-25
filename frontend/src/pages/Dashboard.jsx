import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardApi, todosApi } from '../services/api';
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
  PackageCheck,
  ExternalLink,
  MapPin,
  ListChecks,
  Square
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning-400 to-warning-600 flex items-center justify-center">
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning-400 to-warning-600 flex items-center justify-center">
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-danger-400 to-danger-600 flex items-center justify-center">
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-danger-400 to-danger-600 flex items-center justify-center">
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
                    <div className="bg-dark-100 p-2 border rounded shadow-lg text-sm">
                      <p className="font-medium">{payload[0].payload.fullName}</p>
                      <p className="text-dark-600">{payload[0].value} issues</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="issues" fill="#FF4646" radius={[0, 4, 4, 0]} />
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
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
                    backgroundColor: cat.color || '#4EA8FF'
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
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
            <CartesianGrid strokeDasharray="3 3" stroke="#232B3A" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#828EA3" />
            <YAxis tick={{ fontSize: 12 }} stroke="#828EA3" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#10141C',
                border: '1px solid #232B3A',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#E7ECF4'
              }}
              labelStyle={{ color: '#E7ECF4' }}
              itemStyle={{ color: '#E7ECF4' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="created"
              name="Created"
              stroke="#FFB020"
              strokeWidth={2}
              dot={{ fill: '#FFB020', r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke="#12C489"
              strokeWidth={2}
              dot={{ fill: '#12C489', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// RMA Tracking Widget - Shows shipped RMAs with tracking details
function RmaTrackingWidget({ rmas }) {
  if (!rmas || rmas.length === 0) {
    return (
      <div className="card">
        <div className="px-6 py-5 border-b border-dark-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-dark-900">RMA Tracking</h2>
              <p className="text-sm text-dark-500">Track shipped RMAs</p>
            </div>
          </div>
        </div>
        <div className="p-6 text-center text-dark-500">
          <Package className="w-12 h-12 mx-auto mb-2 text-dark-300" />
          <p>No RMAs currently in transit</p>
        </div>
      </div>
    );
  }

  const getCarrierBadge = () => 'bg-dark-200 text-dark-700 border border-dark-400 font-mono';

  const getCarrierName = (carrier) => {
    const names = { usps: 'USPS', ups: 'UPS', fedex: 'FedEx', dhl: 'DHL' };
    return names[carrier] || 'Unknown';
  };

  const getDaysStyle = (days) => {
    if (days <= 7) return { color: '#17E6A0' }; // signal
    if (days <= 14) return { color: '#FFB020' }; // amber
    return { color: '#FF4646' }; // tally
  };

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">RMA Tracking</h2>
            <p className="text-sm text-dark-500">{rmas.length} shipment{rmas.length !== 1 ? 's' : ''} in transit</p>
          </div>
        </div>
        <Link to="/rmas?status=shipped" className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="divide-y divide-dark-100 max-h-96 overflow-y-auto">
        {rmas.map((rma) => (
          <div key={rma.id} className="px-6 py-3 hover:bg-primary-50/50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Link to={`/rmas/${rma.id}`} className="font-medium text-dark-900 hover:text-primary-600 transition-colors text-sm truncate block">
                  {rma.item_name}
                </Link>
                <p className="text-xs text-dark-500 mt-0.5">
                  <span className="font-mono">{rma.rma_number}</span>
                  <span className="mx-2">•</span>
                  <span>by {rma.created_by_name}</span>
                </p>
              </div>
              <span className="text-xs font-medium" style={getDaysStyle(rma.days_in_transit)}>
                {rma.days_in_transit}d
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={clsx('badge text-xs', getCarrierBadge())}>
                {getCarrierName(rma.carrier)}
              </span>
              <code className="text-xs text-dark-500 font-mono truncate flex-1">
                {rma.tracking_number}
              </code>
              <a
                href={rma.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
                title="Track package"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
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

// Priority dot color — matches the Tasks page (Todos.jsx getPriorityBarColor)
function taskPriorityColor(priority) {
  switch (priority) {
    case 'high': return 'bg-danger-500';
    case 'medium': return 'bg-warning-500';
    case 'low': return 'bg-success-500';
    default: return 'bg-dark-400';
  }
}

// Mirror the Tasks page (Todos.jsx) exactly so a task's overdue/due-today state
// is identical on the dashboard and the /todos page.
function isTaskOverdue(dueDate) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function isTaskDueToday(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate).toDateString() === new Date().toDateString();
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function sortTasksByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const aOver = isTaskOverdue(a.due_date), bOver = isTaskOverdue(b.due_date);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const aToday = isTaskDueToday(a.due_date), bToday = isTaskDueToday(b.due_date);
    if (aToday !== bToday) return aToday ? -1 : 1;
    if (a.due_date && b.due_date && a.due_date !== b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
    return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
  });
}

function TasksWidget() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canComplete = user?.role === 'admin' || user?.role === 'technician';

  const { data: stats } = useQuery({
    queryKey: ['dashboard-task-stats'],
    queryFn: async () => (await todosApi.getStats()).data.stats,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => (await todosApi.getAll({ show_completed: 'false' })).data.todos,
  });

  const toggle = useMutation({
    mutationFn: (id) => todosApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-task-stats'] });
    },
  });

  const open = tasks || [];
  const shown = sortTasksByUrgency(open).slice(0, 50);
  // Both endpoints are facility-wide and uncached, so stats.pending and the list
  // length agree; fall back to the list length if stats hasn't loaded.
  const moreCount = Math.max(0, (stats?.pending ?? open.length) - shown.length);

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-dark-50" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">Tasks</h2>
            <p className="text-sm text-dark-500">{stats?.pending ?? 0} open</p>
          </div>
        </div>
        <Link to="/todos" className="text-sm text-primary-500 hover:text-primary-400 flex items-center gap-1">
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Counts */}
      <div className="px-6 py-4 flex flex-wrap gap-3 border-b border-dark-100">
        <Link to="/todos" className="badge bg-danger-100 text-danger-600 border border-danger-300/60">
          {stats?.overdue ?? 0} Overdue
        </Link>
        <Link to="/todos" className="badge bg-warning-100 text-warning-600 border border-warning-300/60">
          {stats?.due_today ?? 0} Due today
        </Link>
        <Link to="/todos" className="badge bg-accent-100 text-accent-600 border border-accent-300/60">
          {stats?.pending ?? 0} Open
        </Link>
      </div>

      {/* List */}
      {tasksLoading ? (
        <div className="px-6 py-8 flex justify-center">
          <div className="spinner" />
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state py-10">
          <p className="empty-state-text">No open tasks — you're all clear.</p>
        </div>
      ) : (
        <ul className="divide-y divide-dark-100 max-h-80 overflow-y-auto">
          {shown.map((t) => {
            const overdue = isTaskOverdue(t.due_date);
            const dueToday = isTaskDueToday(t.due_date);
            return (
              <li key={t.id} className="px-6 py-3 flex items-center gap-3 hover:bg-primary-500/[0.05] transition-colors">
                <button
                  type="button"
                  disabled={!canComplete || (toggle.isPending && toggle.variables === t.id)}
                  onClick={() => toggle.mutate(t.id)}
                  className="text-dark-500 hover:text-success-500 disabled:opacity-40 disabled:hover:text-dark-500"
                  aria-label="Complete task"
                >
                  <Square className="w-5 h-5" />
                </button>
                <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', taskPriorityColor(t.priority))} />
                <Link to="/todos" className="flex-1 min-w-0 truncate text-dark-800 hover:text-dark-900">
                  {t.title}
                </Link>
                {t.due_date && (
                  <span className={clsx(
                    'text-xs font-mono flex-shrink-0',
                    overdue ? 'text-danger-500 font-semibold' : dueToday ? 'text-warning-500' : 'text-dark-500'
                  )}>
                    {overdue ? 'Overdue' : dueToday ? 'Due today' : new Date(t.due_date).toLocaleDateString()}
                  </span>
                )}
                <span className="text-xs text-dark-500 flex-shrink-0 w-20 truncate text-right" title={t.assigned_to_name || ''}>
                  {t.assigned_to_name || '—'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!tasksLoading && moreCount > 0 && (
        <Link to="/todos" className="block px-6 py-3 text-sm text-dark-500 hover:text-dark-900 hover:bg-primary-500/[0.05] transition-colors">
          + {moreCount} more open task{moreCount === 1 ? '' : 's'} →
        </Link>
      )}
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

  const { data: rmaTracking } = useQuery({
    queryKey: ['rma-tracking'],
    queryFn: async () => {
      const response = await dashboardApi.getRmaTracking();
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

      <TasksWidget />

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

      {/* RMA Widgets (technician+ only) */}
      {user?.role !== 'viewer' && (rmaTracking?.rmas?.length > 0 || shippingUpdates?.updates?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {rmaTracking?.rmas?.length > 0 && (
            <RmaTrackingWidget rmas={rmaTracking?.rmas} />
          )}
          {shippingUpdates?.updates?.length > 0 && (
            <ShippingUpdatesWidget updates={shippingUpdates?.updates} />
          )}
        </div>
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
