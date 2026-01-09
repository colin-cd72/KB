import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  Activity,
  Search,
  Filter,
  Calendar,
  User,
  LogIn,
  Plus,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Package,
  AlertCircle,
  BookOpen,
  Monitor,
  Users
} from 'lucide-react';
import clsx from 'clsx';

const actionIcons = {
  login: LogIn,
  create: Plus,
  update: Edit,
  delete: Trash2,
  view: Eye,
};

const actionColors = {
  login: 'bg-green-100 text-green-700',
  create: 'bg-blue-100 text-blue-700',
  update: 'bg-yellow-100 text-yellow-700',
  delete: 'bg-red-100 text-red-700',
  view: 'bg-gray-100 text-gray-700',
};

const entityIcons = {
  user: Users,
  issue: AlertCircle,
  article: FileText,
  manual: BookOpen,
  equipment: Monitor,
  rma: Package,
};

function ActivityLog() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    entity_type: '',
    search: '',
    start_date: '',
    end_date: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch activity logs
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['activity-logs', page, filters],
    queryFn: async () => {
      const params = { page, limit: 50 };
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const response = await api.get('/activity-logs', { params });
      return response.data;
    },
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['activity-logs-filters'],
    queryFn: async () => {
      const response = await api.get('/activity-logs/filters');
      return response.data;
    },
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['activity-logs-stats'],
    queryFn: async () => {
      const response = await api.get('/activity-logs/stats', { params: { days: 7 } });
      return response.data;
    },
  });

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      user_id: '',
      action: '',
      entity_type: '',
      search: '',
      start_date: '',
      end_date: ''
    });
    setPage(1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Activity Log</h1>
          <p className="mt-1 text-dark-500">Track all system activity and user actions</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={clsx(
            'btn flex items-center gap-2',
            showFilters ? 'btn-primary' : 'btn-secondary'
          )}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <LogIn className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-dark-900">
                  {statsData.byAction?.find(a => a.action === 'login')?.count || 0}
                </p>
                <p className="text-sm text-dark-500">Logins (7d)</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-dark-900">
                  {statsData.byAction?.find(a => a.action === 'create')?.count || 0}
                </p>
                <p className="text-sm text-dark-500">Created (7d)</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Edit className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-dark-900">
                  {statsData.byAction?.find(a => a.action === 'update')?.count || 0}
                </p>
                <p className="text-sm text-dark-500">Updated (7d)</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-dark-900">
                  {statsData.byAction?.find(a => a.action === 'delete')?.count || 0}
                </p>
                <p className="text-sm text-dark-500">Deleted (7d)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-dark-900">Filter Activity</h3>
            <button onClick={clearFilters} className="text-sm text-primary-600 hover:text-primary-700">
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="label">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="Search..."
                  className="input pl-10"
                />
              </div>
            </div>
            <div>
              <label className="label">User</label>
              <select
                value={filters.user_id}
                onChange={(e) => handleFilterChange('user_id', e.target.value)}
                className="input"
              >
                <option value="">All Users</option>
                {filterOptions?.users?.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Action</label>
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                className="input"
              >
                <option value="">All Actions</option>
                {filterOptions?.actions?.map(action => (
                  <option key={action} value={action} className="capitalize">{action}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Entity Type</label>
              <select
                value={filters.entity_type}
                onChange={(e) => handleFilterChange('entity_type', e.target.value)}
                className="input"
              >
                <option value="">All Types</option>
                {filterOptions?.entityTypes?.map(type => (
                  <option key={type} value={type} className="capitalize">{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">From Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">To Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-dark-100 flex items-center justify-between">
          <h3 className="font-medium text-dark-900">
            Recent Activity
            {logsData?.total > 0 && (
              <span className="ml-2 text-sm text-dark-500">({logsData.total} total)</span>
            )}
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logsData?.logs?.length === 0 ? (
          <div className="py-12 text-center text-dark-500">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No activity found</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-100">
            {logsData?.logs?.map((log) => {
              const ActionIcon = actionIcons[log.action] || Activity;
              const EntityIcon = entityIcons[log.entity_type] || FileText;
              return (
                <div key={log.id} className="p-4 hover:bg-dark-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      actionColors[log.action] || 'bg-gray-100 text-gray-700'
                    )}>
                      <ActionIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-dark-900">
                          {log.user_name || 'System'}
                        </span>
                        <span className="text-dark-500">
                          {log.action === 'login' ? 'logged in' :
                           log.action === 'create' ? 'created' :
                           log.action === 'update' ? 'updated' :
                           log.action === 'delete' ? 'deleted' :
                           log.action === 'view' ? 'viewed' : log.action}
                        </span>
                        {log.entity_type && log.action !== 'login' && (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-dark-100 rounded text-sm text-dark-600">
                              <EntityIcon className="w-3 h-3" />
                              {log.entity_type}
                            </span>
                            {log.entity_name && (
                              <span className="text-dark-700 font-medium truncate max-w-xs">
                                "{log.entity_name}"
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-dark-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(log.created_at)}
                        </span>
                        {log.ip_address && (
                          <span>IP: {log.ip_address}</span>
                        )}
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 text-sm text-dark-500 bg-dark-50 rounded p-2">
                          {Object.entries(log.details).map(([key, value]) => (
                            value && (
                              <span key={key} className="mr-3">
                                <span className="text-dark-400">{key}:</span> {String(value)}
                              </span>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {logsData?.totalPages > 1 && (
          <div className="p-4 border-t border-dark-100 flex items-center justify-between">
            <p className="text-sm text-dark-500">
              Page {logsData.page} of {logsData.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary btn-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(logsData.totalPages, p + 1))}
                disabled={page === logsData.totalPages}
                className="btn btn-secondary btn-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityLog;
