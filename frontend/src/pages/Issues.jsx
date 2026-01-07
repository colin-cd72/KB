import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { issuesApi, categoriesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Paperclip
} from 'lucide-react';
import clsx from 'clsx';

function Issues() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  const page = parseInt(searchParams.get('page') || '1');
  const status = searchParams.get('status') || '';
  const priority = searchParams.get('priority') || '';
  const category = searchParams.get('category') || '';

  const { data: issuesData, isLoading } = useQuery({
    queryKey: ['issues', page, status, priority, category, searchTerm],
    queryFn: async () => {
      const params = { page, limit: 20 };
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (category) params.category_id = category;
      if (searchTerm) params.search = searchTerm;
      const response = await issuesApi.getAll(params);
      return response.data;
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const updateParams = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    if (key !== 'page') newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    updateParams('search', searchTerm);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'resolved': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      default: return <CheckCircle2 className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issues</h1>
          <p className="mt-1 text-gray-500">
            {issuesData?.total || 0} total issues
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'technician') && (
          <Link to="/issues/new" className="btn btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Issue
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search issues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <select
              value={status}
              onChange={(e) => updateParams('status', e.target.value)}
              className="input w-auto"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={priority}
              onChange={(e) => updateParams('priority', e.target.value)}
              className="input w-auto"
            >
              <option value="">All Priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={category}
              onChange={(e) => updateParams('category', e.target.value)}
              className="input w-auto"
            >
              <option value="">All Categories</option>
              {categoriesData?.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : issuesData?.issues?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No issues found</p>
          </div>
        ) : (
          <div className="divide-y">
            {issuesData?.issues?.map((issue) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.id}`}
                className="block p-4 hover:bg-gray-50"
              >
                <div className="flex items-start gap-4">
                  {getStatusIcon(issue.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-gray-900">{issue.title}</h3>
                      <span className={`badge badge-${issue.priority}`}>
                        {issue.priority}
                      </span>
                      {issue.category_name && (
                        <span
                          className="badge"
                          style={{ backgroundColor: issue.category_color + '20', color: issue.category_color }}
                        >
                          {issue.category_name}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                      {issue.description}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                      <span>by {issue.created_by_name}</span>
                      <span>{new Date(issue.created_at).toLocaleDateString()}</span>
                      {issue.solution_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {issue.solution_count} solutions
                        </span>
                      )}
                      {issue.attachment_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {issue.attachment_count}
                        </span>
                      )}
                      {issue.has_accepted_solution > 0 && (
                        <span className="text-green-600 font-medium">Solved</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {issuesData?.totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {issuesData.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => updateParams('page', String(page - 1))}
                disabled={page <= 1}
                className="btn btn-secondary"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateParams('page', String(page + 1))}
                disabled={page >= issuesData.totalPages}
                className="btn btn-secondary"
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

export default Issues;
