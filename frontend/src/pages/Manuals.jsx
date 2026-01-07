import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { manualsApi, categoriesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useDropzone } from 'react-dropzone';
import {
  Search,
  Upload,
  FileText,
  Download,
  Trash2,
  Eye,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function Manuals() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState({ title: '', description: '', category_id: '' });
  const [selectedFile, setSelectedFile] = useState(null);

  const { data: manualsData, isLoading } = useQuery({
    queryKey: ['manuals', page, search, categoryFilter],
    queryFn: async () => {
      const params = { page, limit: 12 };
      if (search) params.search = search;
      if (categoryFilter) params.category_id = categoryFilter;
      const response = await manualsApi.getAll(params);
      return response.data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const uploadManual = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', uploadData.title);
      if (uploadData.description) formData.append('description', uploadData.description);
      if (uploadData.category_id) formData.append('category_id', uploadData.category_id);
      return manualsApi.upload(formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['manuals']);
      setShowUpload(false);
      setSelectedFile(null);
      setUploadData({ title: '', description: '', category_id: '' });
      toast.success('Manual uploaded successfully');
    },
  });

  const deleteManual = useMutation({
    mutationFn: (id) => manualsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['manuals']);
      toast.success('Manual deleted');
    },
  });

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadData.title) {
        setUploadData(prev => ({ ...prev, title: file.name.replace('.pdf', '') }));
      }
    }
  }, [uploadData.title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const canUpload = user?.role === 'admin' || user?.role === 'technician';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Manuals</h1>
          <p className="mt-1 text-gray-500">
            {manualsData?.total || 0} manuals in the repository
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Upload Manual
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search manuals..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-10"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="input w-auto"
          >
            <option value="">All Categories</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Manuals Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : manualsData?.manuals?.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No manuals found</h3>
          <p className="mt-1 text-gray-500">Upload your first manual to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {manualsData?.manuals?.map((manual) => (
            <div key={manual.id} className="card hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-red-100 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{manual.title}</h3>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                      {manual.description || 'No description'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                  <span>{manual.category_name || 'Uncategorized'}</span>
                  <span>{(manual.file_size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              </div>
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {new Date(manual.created_at).toLocaleDateString()}
                </span>
                <div className="flex gap-1">
                  <a
                    href={manual.file_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="View"
                  >
                    <Eye className="w-4 h-4 text-gray-500" />
                  </a>
                  <a
                    href={manual.file_path}
                    download={manual.file_name}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="Download"
                  >
                    <Download className="w-4 h-4 text-gray-500" />
                  </a>
                  {canUpload && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this manual?')) deleteManual.mutate(manual.id);
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {manualsData?.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {manualsData.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page <= 1}
              className="btn btn-secondary"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= manualsData.totalPages}
              className="btn btn-secondary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Upload Manual</h2>
              <button onClick={() => setShowUpload(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={clsx(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
                )}
              >
                <input {...getInputProps()} />
                <Upload className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                {selectedFile ? (
                  <p className="text-gray-700 font-medium">{selectedFile.name}</p>
                ) : (
                  <p className="text-gray-500">
                    Drag & drop a PDF file here, or click to select
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">Maximum file size: 50MB</p>
              </div>

              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  value={uploadData.title}
                  onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                  className="input"
                  placeholder="Manual title"
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="Brief description of the manual"
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  value={uploadData.category_id}
                  onChange={(e) => setUploadData({ ...uploadData, category_id: e.target.value })}
                  className="input"
                >
                  <option value="">Select category</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowUpload(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => uploadManual.mutate()}
                disabled={!selectedFile || !uploadData.title || uploadManual.isPending}
                className="btn btn-primary"
              >
                {uploadManual.isPending ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Manuals;
