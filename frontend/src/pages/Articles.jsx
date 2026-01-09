import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi, categoriesApi, equipmentApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  FileText, Plus, Search, Filter, Eye, EyeOff, Star, StarOff,
  Calendar, User, Folder, Monitor, Trash2, Edit, MoreVertical
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

function Articles() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const page = parseInt(searchParams.get('page') || '1');
  const category_id = searchParams.get('category') || '';
  const equipment_id = searchParams.get('equipment') || '';
  const published = searchParams.get('published') || '';

  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  // Fetch articles
  const { data, isLoading } = useQuery({
    queryKey: ['articles', page, searchTerm, category_id, equipment_id, published],
    queryFn: async () => {
      const params = { page, limit: 12 };
      if (searchTerm) params.search = searchTerm;
      if (category_id) params.category_id = category_id;
      if (equipment_id) params.equipment_id = equipment_id;
      if (published) params.published = published;
      const response = await articlesApi.getAll(params);
      return response.data;
    },
  });

  // Fetch categories and equipment for filters
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data;
    },
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: async () => {
      const response = await equipmentApi.getAll({ limit: 100 });
      return response.data.equipment;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => articlesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['articles']);
      toast.success('Article deleted');
      setDeleteConfirm(null);
    },
  });

  // Publish/unpublish mutation
  const publishMutation = useMutation({
    mutationFn: ({ id, is_published }) => articlesApi.publish(id, is_published),
    onSuccess: () => {
      queryClient.invalidateQueries(['articles']);
      toast.success('Article updated');
    },
  });

  // Feature mutation
  const featureMutation = useMutation({
    mutationFn: ({ id, is_featured }) => articlesApi.feature(id, is_featured),
    onSuccess: () => {
      queryClient.invalidateQueries(['articles']);
      toast.success('Article updated');
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Knowledge Base Articles</h1>
          <p className="text-dark-500 mt-1">How-to guides and documentation</p>
        </div>
        {canEdit && (
          <Link to="/articles/new" className="btn btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Article
          </Link>
        )}
      </div>

      {/* Search and Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search articles..."
                className="input pl-10 w-full"
              />
            </div>
          </form>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'} inline-flex items-center gap-2`}
          >
            <Filter className="w-5 h-5" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-dark-100">
            <div>
              <label className="label">Category</label>
              <select
                value={category_id}
                onChange={(e) => updateParams('category', e.target.value)}
                className="input"
              >
                <option value="">All Categories</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Equipment</label>
              <select
                value={equipment_id}
                onChange={(e) => updateParams('equipment', e.target.value)}
                className="input"
              >
                <option value="">All Equipment</option>
                {equipment?.map((eq) => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>
            {canEdit && (
              <div>
                <label className="label">Status</label>
                <select
                  value={published}
                  onChange={(e) => updateParams('published', e.target.value)}
                  className="input"
                >
                  <option value="">All</option>
                  <option value="true">Published</option>
                  <option value="false">Drafts</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Articles Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-6 bg-dark-100 rounded w-3/4 mb-4" />
              <div className="h-4 bg-dark-100 rounded w-full mb-2" />
              <div className="h-4 bg-dark-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : data?.articles?.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-16 h-16 text-dark-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-dark-700 mb-2">No articles found</h3>
          <p className="text-dark-500 mb-6">
            {searchTerm || category_id || equipment_id
              ? 'Try adjusting your search or filters'
              : 'Get started by creating your first article'}
          </p>
          {canEdit && (
            <Link to="/articles/new" className="btn btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create Article
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.articles?.map((article) => (
            <div
              key={article.id}
              className="card hover:shadow-lg transition-all duration-200 group relative"
            >
              {/* Featured badge */}
              {article.is_featured && (
                <div className="absolute top-3 right-3 bg-warning-100 text-warning-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  Featured
                </div>
              )}

              {/* Draft badge */}
              {!article.is_published && canEdit && (
                <div className="absolute top-3 left-3 bg-dark-100 text-dark-600 px-2 py-1 rounded-full text-xs font-medium">
                  Draft
                </div>
              )}

              <Link to={`/articles/${article.slug}`} className="block p-6">
                <h3 className="text-lg font-semibold text-dark-900 mb-2 line-clamp-2 group-hover:text-primary-600 transition-colors">
                  {article.title}
                </h3>
                {article.summary && (
                  <p className="text-dark-500 text-sm line-clamp-3 mb-4">
                    {article.summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-dark-400">
                  {article.category_name && (
                    <span className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 px-2 py-1 rounded">
                      <Folder className="w-3 h-3" />
                      {article.category_name}
                    </span>
                  )}
                  {article.equipment_name && (
                    <span className="inline-flex items-center gap-1 bg-dark-50 text-dark-600 px-2 py-1 rounded">
                      <Monitor className="w-3 h-3" />
                      {article.equipment_name}
                    </span>
                  )}
                </div>
              </Link>

              <div className="px-6 pb-4 pt-2 border-t border-dark-50 flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-dark-400">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {article.author_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {article.view_count}
                  </span>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => publishMutation.mutate({
                        id: article.id,
                        is_published: !article.is_published
                      })}
                      className="p-1.5 text-dark-400 hover:text-dark-600 hover:bg-dark-50 rounded"
                      title={article.is_published ? 'Unpublish' : 'Publish'}
                    >
                      {article.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => featureMutation.mutate({
                          id: article.id,
                          is_featured: !article.is_featured
                        })}
                        className="p-1.5 text-dark-400 hover:text-warning-600 hover:bg-warning-50 rounded"
                        title={article.is_featured ? 'Unfeature' : 'Feature'}
                      >
                        {article.is_featured ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                      </button>
                    )}
                    <Link
                      to={`/articles/${article.id}/edit`}
                      className="p-1.5 text-dark-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm(article.id)}
                      className="p-1.5 text-dark-400 hover:text-danger-600 hover:bg-danger-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => updateParams('page', String(page - 1))}
            disabled={page <= 1}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span className="flex items-center px-4 text-dark-500">
            Page {page} of {data.totalPages}
          </span>
          <button
            onClick={() => updateParams('page', String(page + 1))}
            disabled={page >= data.totalPages}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-dark-900 mb-2">Delete Article?</h3>
            <p className="text-dark-500 mb-6">
              This action cannot be undone. The article and all its images will be permanently deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                className="btn btn-danger"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Articles;
