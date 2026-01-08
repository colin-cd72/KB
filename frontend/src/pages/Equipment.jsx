import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { equipmentApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { QRCodeSVG } from 'qrcode.react';
import {
  Search,
  Plus,
  Monitor,
  MapPin,
  AlertCircle,
  QrCode,
  X,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Check,
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowUpDown,
  Calendar,
  Building2,
  FileText,
  Hash,
  ExternalLink,
  BookOpen,
  Link2,
  Unlink,
  Globe,
  Info,
  Image,
  Download
} from 'lucide-react';
import toast from 'react-hot-toast';

function Equipment() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    serial_number: '',
    manufacturer: '',
    location: '',
    description: ''
  });

  // Sorting state
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Detail view state
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [equipmentDetails, setEquipmentDetails] = useState(null);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1: upload, 2: map columns, 3: results
  const [importData, setImportData] = useState(null);
  const [columnMappings, setColumnMappings] = useState({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Manual management state
  const [showManualFinder, setShowManualFinder] = useState(false);
  const [manualSearchResults, setManualSearchResults] = useState(null);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSuggestions, setManualSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showLinkManual, setShowLinkManual] = useState(false);

  // Image management state
  const [fetchingImage, setFetchingImage] = useState(false);
  const [bulkFetchingImages, setBulkFetchingImages] = useState(false);
  const imageInputRef = useRef(null);

  const { data: equipmentData, isLoading } = useQuery({
    queryKey: ['equipment', page, search, sortBy, sortOrder],
    queryFn: async () => {
      const params = { page, limit: 12, sortBy, sortOrder };
      if (search) params.search = search;
      const response = await equipmentApi.getAll(params);
      return response.data;
    },
  });

  // Fetch details when equipment is selected
  const handleViewDetails = async (eq) => {
    setSelectedEquipment(eq);
    setLoadingDetails(true);
    try {
      const response = await equipmentApi.getOne(eq.id);
      setEquipmentDetails(response.data);
    } catch (error) {
      toast.error('Failed to load equipment details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeDetails = () => {
    setSelectedEquipment(null);
    setEquipmentDetails(null);
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'model', label: 'Model' },
    { value: 'location', label: 'Location' },
    { value: 'manufacturer', label: 'Manufacturer' },
    { value: 'created_at', label: 'Date Added' }
  ];

  const { data: locations } = useQuery({
    queryKey: ['equipment-locations'],
    queryFn: async () => {
      const response = await equipmentApi.getLocations();
      return response.data.locations;
    },
  });

  const createEquipment = useMutation({
    mutationFn: (data) => equipmentApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['equipment']);
      resetForm();
      toast.success('Equipment added');

      // Prompt to add manual for the new equipment
      const newEquipment = response.data.equipment;
      if (newEquipment) {
        toast((t) => (
          <div className="flex flex-col gap-2">
            <p className="font-medium">Add a manual for {newEquipment.name}?</p>
            <p className="text-sm text-gray-500">Link documentation to help with troubleshooting</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  handleViewDetails(newEquipment);
                  setTimeout(() => {
                    setShowManualFinder(true);
                    handleFindManualOnline(newEquipment.id);
                  }, 300);
                }}
                className="text-xs bg-primary-100 hover:bg-primary-200 text-primary-700 px-3 py-1.5 rounded-lg"
              >
                Find Manual
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
              >
                Later
              </button>
            </div>
          </div>
        ), {
          duration: 10000,
          position: 'bottom-right',
        });
      }
    },
  });

  const updateEquipment = useMutation({
    mutationFn: ({ id, data }) => equipmentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['equipment']);
      resetForm();
      toast.success('Equipment updated');
    },
  });

  const deleteEquipment = useMutation({
    mutationFn: (id) => equipmentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['equipment']);
      toast.success('Equipment removed');
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', model: '', serial_number: '', manufacturer: '', location: '', description: '' });
  };

  // Import functions
  const resetImport = async () => {
    if (importData?.tempFile) {
      try {
        await equipmentApi.importCancel(importData.tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    setShowImport(false);
    setImportStep(1);
    setImportData(null);
    setColumnMappings({});
    setImportResults(null);
    setImporting(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const response = await equipmentApi.importPreview(formData);
      setImportData(response.data);
      setColumnMappings(response.data.suggestedMappings || {});
      setImportStep(2);
    } catch (error) {
      // Error is handled by API interceptor
    } finally {
      setUploading(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Check file type
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      toast.error('Only Excel (.xlsx, .xls) and CSV files are allowed');
      return;
    }

    await processFile(file);
  };

  const handleImportExecute = async () => {
    if (!importData?.tempFile) return;

    setImporting(true);
    try {
      const response = await equipmentApi.importExecute({
        tempFile: importData.tempFile,
        mappings: columnMappings,
        skipDuplicates
      });
      setImportResults(response.data.results);
      setImportStep(3);
      queryClient.invalidateQueries(['equipment']);
    } catch (error) {
      // Error is handled by API interceptor
    } finally {
      setImporting(false);
    }
  };

  const fieldLabels = {
    name: 'Name',
    model: 'Model',
    serial_number: 'Serial Number',
    manufacturer: 'Manufacturer',
    location: 'Location',
    description: 'Description'
  };

  // Manual management functions
  const handleFindManualOnline = async (equipmentId) => {
    setManualSearching(true);
    setManualSearchResults(null);
    try {
      const response = await equipmentApi.findManual(equipmentId);
      setManualSearchResults(response.data);
    } catch (error) {
      toast.error('Failed to search for manual');
    } finally {
      setManualSearching(false);
    }
  };

  const handleGetManualSuggestions = async (equipmentId) => {
    setLoadingSuggestions(true);
    setManualSuggestions(null);
    try {
      const response = await equipmentApi.getManualSuggestions(equipmentId);
      setManualSuggestions(response.data);
    } catch (error) {
      toast.error('Failed to get manual suggestions');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleLinkManual = async (equipmentId, manualId) => {
    try {
      await equipmentApi.linkManual(equipmentId, manualId);
      toast.success('Manual linked successfully');
      // Refresh equipment details
      const response = await equipmentApi.getOne(equipmentId);
      setEquipmentDetails(response.data);
      setShowLinkManual(false);
      setManualSuggestions(null);
      queryClient.invalidateQueries(['equipment']);
    } catch (error) {
      toast.error('Failed to link manual');
    }
  };

  const handleUnlinkManual = async (equipmentId, manualId) => {
    if (!confirm('Unlink this manual from the equipment?')) return;
    try {
      await equipmentApi.unlinkManual(equipmentId, manualId);
      toast.success('Manual unlinked');
      // Refresh equipment details
      const response = await equipmentApi.getOne(equipmentId);
      setEquipmentDetails(response.data);
      queryClient.invalidateQueries(['equipment']);
    } catch (error) {
      toast.error('Failed to unlink manual');
    }
  };

  // Image management functions
  const handleFetchImage = async (equipmentId) => {
    setFetchingImage(true);
    try {
      const response = await equipmentApi.fetchImage(equipmentId);
      if (response.data.success) {
        toast.success(response.data.reused ? 'Image linked from existing model' : 'Image fetched successfully');
        // Refresh equipment details
        const detailResponse = await equipmentApi.getOne(equipmentId);
        setEquipmentDetails(detailResponse.data);
        queryClient.invalidateQueries(['equipment']);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to fetch image');
    } finally {
      setFetchingImage(false);
    }
  };

  const handleBulkFetchImages = async () => {
    if (!confirm('This will attempt to fetch images for equipment without images. Some may fail due to website restrictions. Continue?')) return;
    setBulkFetchingImages(true);
    const toastId = toast.loading('Fetching images... This may take a few minutes');
    try {
      const response = await equipmentApi.fetchImagesBulk();
      toast.dismiss(toastId);
      if (response.data.success > 0) {
        toast.success(`Fetched ${response.data.success} images, ${response.data.failed} failed`);
      } else if (response.data.processed === 0) {
        toast.success('All equipment already has images');
      } else {
        toast.error(`Could not fetch images (${response.data.failed} failed). Try uploading manually.`);
      }
      queryClient.invalidateQueries(['equipment']);
    } catch (error) {
      toast.dismiss(toastId);
      toast.error('Bulk image fetch failed');
    } finally {
      setBulkFetchingImages(false);
    }
  };

  const handleImageUpload = async (e, equipmentId) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);
    formData.append('applyToSameModel', 'true');

    setFetchingImage(true);
    try {
      const response = await equipmentApi.uploadImage(equipmentId, formData);
      if (response.data.success) {
        toast.success('Image uploaded successfully');
        const detailResponse = await equipmentApi.getOne(equipmentId);
        setEquipmentDetails(detailResponse.data);
        queryClient.invalidateQueries(['equipment']);
      }
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setFetchingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleDeleteImage = async (equipmentId) => {
    if (!confirm('Remove this image?')) return;

    setFetchingImage(true);
    try {
      await equipmentApi.deleteImage(equipmentId);
      toast.success('Image removed');
      const detailResponse = await equipmentApi.getOne(equipmentId);
      setEquipmentDetails(detailResponse.data);
      queryClient.invalidateQueries(['equipment']);
    } catch (error) {
      toast.error('Failed to remove image');
    } finally {
      setFetchingImage(false);
    }
  };

  const handleEdit = (eq) => {
    setFormData({
      name: eq.name || '',
      model: eq.model || '',
      serial_number: eq.serial_number || '',
      manufacturer: eq.manufacturer || '',
      location: eq.location || '',
      description: eq.description || ''
    });
    setEditingId(eq.id);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateEquipment.mutate({ id: editingId, data: formData });
    } else {
      createEquipment.mutate(formData);
    }
  };

  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
          <p className="mt-1 text-gray-500">
            {equipmentData?.total || 0} items in registry
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkFetchImages}
              disabled={bulkFetchingImages}
              className="btn btn-secondary flex items-center gap-2"
              title="Fetch product images for all equipment"
            >
              {bulkFetchingImages ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Image className="w-5 h-5" />
              )}
              {bulkFetchingImages ? 'Fetching...' : 'Fetch Images'}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              Import
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Equipment
            </button>
          </div>
        )}
      </div>

      {/* Search and Sort */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, model, or serial number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="input py-2 w-40"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={toggleSortOrder}
              className="btn btn-secondary px-3"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
            </button>
          </div>
        </div>
      </div>

      {/* Equipment Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : equipmentData?.equipment?.length === 0 ? (
        <div className="card p-12 text-center">
          <Monitor className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No equipment found</h3>
          <p className="mt-1 text-gray-500">Add equipment to start tracking issues</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {equipmentData?.equipment?.map((eq) => (
            <div
              key={eq.id}
              className="card hover:shadow-md transition-shadow cursor-pointer group overflow-hidden"
              onClick={() => handleViewDetails(eq)}
            >
              {/* Equipment Image */}
              {eq.image_path ? (
                <div className="h-32 bg-gray-100 overflow-hidden">
                  <img
                    src={`/api${eq.image_path}`}
                    alt={eq.name}
                    className="w-full h-full object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="h-32 bg-gradient-to-br from-purple-50 to-purple-100 flex items-center justify-center">
                  <Monitor className="w-12 h-12 text-purple-300" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                      {eq.name}
                    </h3>
                    <p className="text-sm text-gray-500">{eq.model || 'No model'}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowQR(eq); }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="Show QR Code"
                  >
                    <QrCode className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  {eq.serial_number && (
                    <p className="flex items-center gap-2 text-gray-500">
                      <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{eq.serial_number}</span>
                    </p>
                  )}
                  {eq.manufacturer && (
                    <p className="flex items-center gap-2 text-gray-500">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{eq.manufacturer}</span>
                    </p>
                  )}
                  {eq.location && (
                    <p className="flex items-center gap-2 text-gray-500">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{eq.location}</span>
                    </p>
                  )}
                  {eq.description && (
                    <p className="text-gray-400 text-xs line-clamp-2 mt-2">
                      {eq.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    {eq.open_issue_count > 0 ? (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {eq.open_issue_count} open
                      </span>
                    ) : (
                      <span className="text-green-600">No issues</span>
                    )}
                    {eq.manual_count > 0 && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <BookOpen className="w-3.5 h-3.5" />
                        {eq.manual_count} manual{eq.manual_count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400">
                    {eq.created_at && new Date(eq.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
                <Link
                  to={`/issues?equipment=${eq.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  View Issues <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                {canEdit && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(eq); }}
                      className="p-2 hover:bg-gray-200 rounded-lg"
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Remove this equipment?')) deleteEquipment.mutate(eq.id);
                      }}
                      className="p-2 hover:bg-red-100 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {equipmentData?.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {equipmentData.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="btn btn-secondary">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= equipmentData.totalPages} className="btn btn-secondary">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit' : 'Add'} Equipment</h2>
              <button onClick={resetForm} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="label">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Manufacturer</label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="input"
                  list="locations"
                />
                <datalist id="locations">
                  {locations?.map((loc) => <option key={loc} value={loc} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={resetForm} className="btn btn-secondary">Cancel</button>
                <button
                  type="submit"
                  disabled={createEquipment.isPending || updateEquipment.isPending}
                  className="btn btn-primary"
                >
                  {editingId ? 'Save Changes' : 'Add Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-xl p-6 mx-4 text-center">
            <h2 className="text-lg font-semibold mb-4">{showQR.name}</h2>
            <div className="inline-block p-4 bg-white border rounded-lg">
              <QRCodeSVG value={showQR.qr_code} size={200} />
            </div>
            <p className="mt-4 text-sm text-gray-500 font-mono">{showQR.qr_code}</p>
            <button onClick={() => setShowQR(null)} className="mt-4 btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Equipment Details Modal */}
      {selectedEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header with Image */}
            <div className="flex items-start gap-4 px-6 py-4 border-b">
              {/* Equipment Image or Placeholder */}
              <div className="relative flex-shrink-0">
                {equipmentDetails?.equipment?.image_path ? (
                  <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={`/api${equipmentDetails.equipment.image_path}`}
                      alt={selectedEquipment.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Monitor className="w-10 h-10 text-purple-400" />
                  </div>
                )}
                {canEdit && equipmentDetails?.equipment?.image_path && (
                  <button
                    onClick={() => handleDeleteImage(selectedEquipment.id)}
                    disabled={fetchingImage}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {canEdit && !equipmentDetails?.equipment?.image_path && (
                  <div className="absolute -bottom-2 -right-2 flex gap-1">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, selectedEquipment.id)}
                    />
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={fetchingImage}
                      className="p-1.5 bg-green-600 text-white rounded-full hover:bg-green-700 shadow-lg"
                      title="Upload image"
                    >
                      {fetchingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleFetchImage(selectedEquipment.id)}
                      disabled={fetchingImage}
                      className="p-1.5 bg-primary-600 text-white rounded-full hover:bg-primary-700 shadow-lg"
                      title="Auto-fetch from web"
                    >
                      {fetchingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold">{selectedEquipment.name}</h2>
                <p className="text-sm text-gray-500">{selectedEquipment.model || 'No model specified'}</p>
                {selectedEquipment.manufacturer && (
                  <p className="text-sm text-gray-400">{selectedEquipment.manufacturer}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowQR(selectedEquipment)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Show QR Code"
                >
                  <QrCode className="w-5 h-5 text-gray-500" />
                </button>
                <button onClick={closeDetails} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {loadingDetails ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
              ) : equipmentDetails ? (
                <div className="space-y-6">
                  {/* Equipment Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {equipmentDetails.equipment.serial_number && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <Hash className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-medium">Serial Number</p>
                          <p className="text-gray-900 font-mono">{equipmentDetails.equipment.serial_number}</p>
                        </div>
                      </div>
                    )}
                    {equipmentDetails.equipment.manufacturer && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-medium">Manufacturer</p>
                          <p className="text-gray-900">{equipmentDetails.equipment.manufacturer}</p>
                        </div>
                      </div>
                    )}
                    {equipmentDetails.equipment.location && (
                      <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-medium">Location</p>
                          <p className="text-gray-900">{equipmentDetails.equipment.location}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-medium">Added</p>
                        <p className="text-gray-900">
                          {new Date(equipmentDetails.equipment.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {equipmentDetails.equipment.description && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Description
                      </h3>
                      <p className="text-gray-600 bg-gray-50 rounded-lg p-4">
                        {equipmentDetails.equipment.description}
                      </p>
                    </div>
                  )}

                  {/* Additional Fields (any extra columns from import) */}
                  {(() => {
                    const standardFields = ['id', 'name', 'model', 'serial_number', 'manufacturer', 'location', 'description', 'qr_code', 'created_by', 'created_at', 'updated_at', 'is_active', 'custom_fields'];
                    const extraFields = Object.entries(equipmentDetails.equipment).filter(
                      ([key, value]) => !standardFields.includes(key) && value !== null && value !== ''
                    );
                    if (extraFields.length === 0) return null;
                    return (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Additional Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {extraFields.map(([key, value]) => (
                            <div key={key} className="p-3 bg-gray-50 rounded-lg">
                              <p className="text-xs text-gray-500 uppercase font-medium">
                                {key.replace(/_/g, ' ')}
                              </p>
                              <p className="text-gray-900">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Recent Issues */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Recent Issues
                      </h3>
                      <Link
                        to={`/issues?equipment=${selectedEquipment.id}`}
                        onClick={closeDetails}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        View all
                      </Link>
                    </div>
                    {equipmentDetails.recent_issues?.length > 0 ? (
                      <div className="space-y-2">
                        {equipmentDetails.recent_issues.map((issue) => (
                          <Link
                            key={issue.id}
                            to={`/issues/${issue.id}`}
                            onClick={closeDetails}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full ${
                                issue.status === 'open' ? 'bg-red-500' :
                                issue.status === 'in_progress' ? 'bg-yellow-500' :
                                issue.status === 'resolved' ? 'bg-green-500' : 'bg-gray-400'
                              }`} />
                              <span className="text-gray-900">{issue.title}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`px-2 py-0.5 rounded-full ${
                                issue.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                issue.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                issue.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {issue.priority}
                              </span>
                              <span className="text-gray-400">
                                {new Date(issue.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm bg-gray-50 rounded-lg p-4 text-center">
                        No issues recorded for this equipment
                      </p>
                    )}
                  </div>

                  {/* Related Manuals */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Manuals
                      </h3>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setShowManualFinder(true);
                              handleFindManualOnline(selectedEquipment.id);
                            }}
                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            Find Online
                          </button>
                          <button
                            onClick={() => {
                              setShowLinkManual(true);
                              handleGetManualSuggestions(selectedEquipment.id);
                            }}
                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" />
                            Link Existing
                          </button>
                        </div>
                      )}
                    </div>

                    {equipmentDetails.manuals?.length > 0 ? (
                      <div className="space-y-2">
                        {equipmentDetails.manuals.map((manual) => (
                          <div
                            key={manual.id}
                            className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors group"
                          >
                            <Link
                              to={`/manuals/${manual.id}`}
                              onClick={closeDetails}
                              className="flex items-center gap-3 flex-1"
                            >
                              <FileText className="w-4 h-4 text-blue-600" />
                              <span className="text-gray-900">{manual.title}</span>
                              {manual.version && (
                                <span className="text-xs text-gray-500">v{manual.version}</span>
                              )}
                            </Link>
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/manuals/${manual.id}`}
                                onClick={closeDetails}
                                className="p-1 text-gray-400 hover:text-blue-600"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                              {canEdit && (
                                <button
                                  onClick={() => handleUnlinkManual(selectedEquipment.id, manual.id)}
                                  className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Unlink manual"
                                >
                                  <Unlink className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-yellow-800">No manuals linked</p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Link a manual to help with troubleshooting and documentation
                            </p>
                            {canEdit && (
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => {
                                    setShowManualFinder(true);
                                    handleFindManualOnline(selectedEquipment.id);
                                  }}
                                  className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1.5 rounded-lg flex items-center gap-1"
                                >
                                  <Globe className="w-3 h-3" />
                                  Find Manual Online
                                </button>
                                <button
                                  onClick={() => {
                                    setShowLinkManual(true);
                                    handleGetManualSuggestions(selectedEquipment.id);
                                  }}
                                  className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1.5 rounded-lg flex items-center gap-1"
                                >
                                  <Link2 className="w-3 h-3" />
                                  Link Existing Manual
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Find Manual Online Modal */}
                  {showManualFinder && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                          <div className="flex items-center gap-3">
                            <Globe className="w-5 h-5 text-primary-600" />
                            <h3 className="font-semibold">Find Manual Online</h3>
                          </div>
                          <button
                            onClick={() => {
                              setShowManualFinder(false);
                              setManualSearchResults(null);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                          {manualSearching ? (
                            <div className="flex flex-col items-center justify-center py-12">
                              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
                              <p className="text-sm text-gray-500">Searching for manual sources...</p>
                            </div>
                          ) : manualSearchResults ? (
                            <div className="space-y-4">
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-sm text-gray-600">
                                  <span className="font-medium">Equipment:</span> {manualSearchResults.equipment?.name}
                                </p>
                                {manualSearchResults.equipment?.manufacturer && (
                                  <p className="text-sm text-gray-600">
                                    <span className="font-medium">Manufacturer:</span> {manualSearchResults.equipment.manufacturer}
                                  </p>
                                )}
                                {manualSearchResults.equipment?.model && (
                                  <p className="text-sm text-gray-600">
                                    <span className="font-medium">Model:</span> {manualSearchResults.equipment.model}
                                  </p>
                                )}
                              </div>

                              {manualSearchResults.found ? (
                                <>
                                  {manualSearchResults.manufacturer_url && (
                                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                      <p className="text-sm font-medium text-green-800 mb-2">Manufacturer Website</p>
                                      <a
                                        href={manualSearchResults.manufacturer_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-green-700 hover:text-green-800 underline flex items-center gap-1"
                                      >
                                        {manualSearchResults.manufacturer_url}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  )}

                                  {manualSearchResults.manual_search_url && (
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                      <p className="text-sm font-medium text-blue-800 mb-2">Documentation Page</p>
                                      <a
                                        href={manualSearchResults.manual_search_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-700 hover:text-blue-800 underline flex items-center gap-1"
                                      >
                                        {manualSearchResults.manual_search_url}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  )}

                                  {manualSearchResults.search_tips && (
                                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                      <p className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                        <Info className="w-4 h-4" />
                                        How to find the manual
                                      </p>
                                      <p className="text-sm text-gray-600">{manualSearchResults.search_tips}</p>
                                    </div>
                                  )}

                                  {manualSearchResults.alternative_sources?.length > 0 && (
                                    <div>
                                      <p className="text-sm font-medium text-gray-700 mb-2">Alternative Sources</p>
                                      <div className="space-y-2">
                                        {manualSearchResults.alternative_sources.map((url, i) => (
                                          <a
                                            key={i}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block text-sm text-primary-600 hover:text-primary-700 underline"
                                          >
                                            {url}
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {manualSearchResults.notes && (
                                    <p className="text-xs text-gray-500 italic">{manualSearchResults.notes}</p>
                                  )}

                                  <div className="pt-4 border-t">
                                    <p className="text-sm text-gray-600 mb-3">
                                      After downloading the manual, upload it to the Manuals section and link it to this equipment.
                                    </p>
                                    <Link
                                      to="/manuals"
                                      onClick={() => {
                                        setShowManualFinder(false);
                                        closeDetails();
                                      }}
                                      className="btn btn-primary text-sm flex items-center gap-2 justify-center"
                                    >
                                      <Upload className="w-4 h-4" />
                                      Go to Manuals
                                    </Link>
                                  </div>
                                </>
                              ) : (
                                <div className="text-center py-8">
                                  <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                                  <p className="text-gray-700 font-medium">No manual sources found</p>
                                  <p className="text-sm text-gray-500 mt-1">
                                    Try searching manually on the manufacturer's website
                                  </p>
                                  {manualSearchResults.error && (
                                    <p className="text-xs text-red-500 mt-2">{manualSearchResults.error}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Link Existing Manual Modal */}
                  {showLinkManual && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                          <div className="flex items-center gap-3">
                            <Link2 className="w-5 h-5 text-primary-600" />
                            <h3 className="font-semibold">Link Manual to Equipment</h3>
                          </div>
                          <button
                            onClick={() => {
                              setShowLinkManual(false);
                              setManualSuggestions(null);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                          {loadingSuggestions ? (
                            <div className="flex flex-col items-center justify-center py-12">
                              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
                              <p className="text-sm text-gray-500">Finding matching manuals...</p>
                            </div>
                          ) : manualSuggestions ? (
                            <div className="space-y-4">
                              {/* AI Suggested */}
                              {manualSuggestions.ai_suggested && (
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-purple-500" />
                                    AI Recommended
                                  </p>
                                  <button
                                    onClick={() => handleLinkManual(selectedEquipment.id, manualSuggestions.ai_suggested.id)}
                                    className="w-full p-4 bg-purple-50 border-2 border-purple-200 rounded-lg hover:bg-purple-100 text-left transition-colors"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium text-gray-900">{manualSuggestions.ai_suggested.title}</p>
                                        {manualSuggestions.ai_suggested.description && (
                                          <p className="text-sm text-gray-500 mt-1">{manualSuggestions.ai_suggested.description}</p>
                                        )}
                                      </div>
                                      <Link2 className="w-5 h-5 text-purple-600" />
                                    </div>
                                  </button>
                                </div>
                              )}

                              {/* Similar Manuals */}
                              {manualSuggestions.similar_manuals?.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-2">Similar Manuals</p>
                                  <div className="space-y-2">
                                    {manualSuggestions.similar_manuals
                                      .filter(m => m.id !== manualSuggestions.ai_suggested?.id)
                                      .map((manual) => (
                                        <button
                                          key={manual.id}
                                          onClick={() => handleLinkManual(selectedEquipment.id, manual.id)}
                                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-left transition-colors flex items-center justify-between"
                                        >
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{manual.title}</p>
                                            {manual.description && (
                                              <p className="text-xs text-gray-500 mt-0.5">{manual.description}</p>
                                            )}
                                          </div>
                                          <Link2 className="w-4 h-4 text-gray-400" />
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {/* All Available */}
                              {manualSuggestions.all_available?.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-2">All Available Manuals</p>
                                  <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {manualSuggestions.all_available
                                      .filter(m =>
                                        m.id !== manualSuggestions.ai_suggested?.id &&
                                        !manualSuggestions.similar_manuals?.some(sm => sm.id === m.id)
                                      )
                                      .map((manual) => (
                                        <button
                                          key={manual.id}
                                          onClick={() => handleLinkManual(selectedEquipment.id, manual.id)}
                                          className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition-colors flex items-center justify-between"
                                        >
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{manual.title}</p>
                                            <p className="text-xs text-gray-400">{manual.file_name}</p>
                                          </div>
                                          <Link2 className="w-4 h-4 text-gray-400" />
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {!manualSuggestions.ai_suggested &&
                               !manualSuggestions.similar_manuals?.length &&
                               !manualSuggestions.all_available?.length && (
                                <div className="text-center py-8">
                                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                  <p className="text-gray-700 font-medium">No manuals available</p>
                                  <p className="text-sm text-gray-500 mt-1">
                                    Upload a manual first, then link it to this equipment
                                  </p>
                                  <Link
                                    to="/manuals"
                                    onClick={() => {
                                      setShowLinkManual(false);
                                      closeDetails();
                                    }}
                                    className="btn btn-primary text-sm mt-4 inline-flex items-center gap-2"
                                  >
                                    <Upload className="w-4 h-4" />
                                    Upload Manual
                                  </Link>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  Failed to load equipment details
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-between">
              <div className="flex gap-2">
                {canEdit && (
                  <>
                    <button
                      onClick={() => { closeDetails(); handleEdit(selectedEquipment); }}
                      className="btn btn-secondary flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Remove this equipment?')) {
                          deleteEquipment.mutate(selectedEquipment.id);
                          closeDetails();
                        }
                      }}
                      className="btn btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
              <button onClick={closeDetails} className="btn btn-primary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-primary-600" />
                <div>
                  <h2 className="text-lg font-semibold">Import Equipment</h2>
                  <p className="text-sm text-gray-500">
                    {importStep === 1 && 'Upload an Excel or CSV file'}
                    {importStep === 2 && `Map columns for ${importData?.totalRows || 0} rows`}
                    {importStep === 3 && 'Import complete'}
                  </p>
                </div>
              </div>
              <button onClick={resetImport} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Step 1: Upload */}
              {importStep === 1 && (
                <div
                  className="text-center py-12 min-h-[300px]"
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={uploading ? undefined : handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`mx-auto w-64 h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all ${
                      uploading
                        ? 'border-primary-500 bg-primary-50 cursor-wait'
                        : isDragging
                        ? 'border-primary-500 bg-primary-100 scale-105 shadow-lg cursor-pointer'
                        : 'border-gray-300 hover:border-primary-500 hover:bg-primary-50 cursor-pointer'
                    }`}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-12 h-12 mb-3 text-primary-600 animate-spin" />
                        <p className="text-sm font-medium text-primary-700">Processing file...</p>
                        <p className="text-xs text-primary-500 mt-1">Analyzing with AI</p>
                      </>
                    ) : (
                      <>
                        <Upload className={`w-12 h-12 mb-3 transition-colors ${isDragging ? 'text-primary-600' : 'text-gray-400'}`} />
                        <p className={`text-sm font-medium ${isDragging ? 'text-primary-700' : 'text-gray-700'}`}>
                          {isDragging ? 'Drop file here!' : 'Click or drag to upload'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">.xlsx, .xls, or .csv</p>
                      </>
                    )}
                  </div>
                  <p className="mt-6 text-sm text-gray-500">
                    First row should contain column headers
                  </p>
                </div>
              )}

              {/* Step 2: Map Columns */}
              {importStep === 2 && importData && (
                <div className="space-y-6">
                  {/* Info banner */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        {importData.filename} - {importData.totalRows} rows found
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Map your spreadsheet columns to equipment fields below
                      </p>
                    </div>
                  </div>

                  {/* AI Analysis badge */}
                  {importData.aiAnalysis && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      importData.aiAnalysis.confidence === 'high'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : importData.aiAnalysis.confidence === 'medium'
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        : 'bg-gray-50 text-gray-700 border border-gray-200'
                    }`}>
                      <Sparkles className="w-4 h-4" />
                      <span className="font-medium">AI-suggested mappings</span>
                      <span className="text-xs opacity-75">
                        ({importData.aiAnalysis.confidence} confidence)
                      </span>
                      {importData.aiAnalysis.notes && (
                        <span className="text-xs opacity-75 ml-2">
                          — {importData.aiAnalysis.notes}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Column mappings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {importData.headers.map((header) => {
                      const isMapped = columnMappings[header] && columnMappings[header] !== '';
                      return (
                        <div key={header} className={`flex items-center gap-3 p-3 rounded-lg ${isMapped ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{header}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {importData.previewRows[0]?.[header] || '(empty)'}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <select
                            value={columnMappings[header] || ''}
                            onChange={(e) => setColumnMappings({ ...columnMappings, [header]: e.target.value })}
                            className="input py-1.5 w-44"
                          >
                            <option value="">New Column</option>
                            {importData.equipmentFields.map((field) => (
                              <option key={field} value={field}>
                                {fieldLabels[field] || field}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-green-200 border border-green-300"></div>
                      <span className="text-gray-600">Mapped to existing field</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-blue-200 border border-blue-300"></div>
                      <span className="text-gray-600">Will create new database column</span>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="border-t pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">
                        Skip rows with duplicate serial numbers
                      </span>
                    </label>
                  </div>

                  {/* Preview table */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Preview (first 5 rows)</h3>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {importData.headers.map((header) => (
                              <th key={header} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {importData.previewRows.slice(0, 5).map((row, i) => (
                            <tr key={i}>
                              {importData.headers.map((header) => (
                                <td key={header} className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
                                  {row[header] || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Results */}
              {importStep === 3 && importResults && (
                <div className="text-center py-8">
                  <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
                    importResults.imported > 0 ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    {importResults.imported > 0 ? (
                      <Check className="w-8 h-8 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-8 h-8 text-yellow-600" />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Import Complete</h3>
                  <div className="flex justify-center gap-8 mb-6">
                    <div>
                      <p className="text-3xl font-bold text-green-600">{importResults.imported}</p>
                      <p className="text-sm text-gray-500">Imported</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-yellow-600">{importResults.skipped}</p>
                      <p className="text-sm text-gray-500">Skipped</p>
                    </div>
                  </div>

                  {/* New columns created */}
                  {importResults.columnsCreated?.length > 0 && (
                    <div className="text-left max-w-md mx-auto mb-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">New database columns created:</h4>
                      <div className="flex flex-wrap gap-2">
                        {importResults.columnsCreated.map((field, i) => (
                          <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResults.errors.length > 0 && (
                    <div className="text-left max-w-md mx-auto">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Errors:</h4>
                      <div className="max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-3 text-sm">
                        {importResults.errors.slice(0, 20).map((err, i) => (
                          <p key={i} className="text-gray-600">
                            <span className="font-medium">Row {err.row}:</span> {err.error}
                          </p>
                        ))}
                        {importResults.errors.length > 20 && (
                          <p className="text-gray-500 mt-2">
                            ...and {importResults.errors.length - 20} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              {importStep === 2 && (
                <>
                  <button onClick={resetImport} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleImportExecute}
                    disabled={importing}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Import {importData?.totalRows || 0} Rows
                      </>
                    )}
                  </button>
                </>
              )}
              {importStep === 3 && (
                <button onClick={resetImport} className="btn btn-primary">
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Equipment;
