import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { rmasApi, equipmentApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Plus,
  Search,
  Package,
  ArrowRight,
  Camera,
  Loader2,
  X,
  Upload,
  Sparkles,
  CheckCircle,
  Clock,
  Truck,
  PackageCheck,
  XCircle,
  Filter,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-warning-600 bg-warning-50 border-warning-200' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'text-primary-600 bg-primary-50 border-primary-200' },
  shipped: { label: 'Shipped', icon: Truck, color: 'text-accent-600 bg-accent-50 border-accent-200' },
  received: { label: 'Received', icon: PackageCheck, color: 'text-success-600 bg-success-50 border-success-200' },
  complete: { label: 'Complete', icon: CheckCircle, color: 'text-success-600 bg-success-50 border-success-200' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'text-danger-600 bg-danger-50 border-danger-200' }
};

function RMAs() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const [formData, setFormData] = useState({
    item_name: '',
    serial_number: '',
    part_number: '',
    equipment_id: '',
    reason: '',
    description: ''
  });
  const [analyzedImagePath, setAnalyzedImagePath] = useState(null);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentSuggestions, setEquipmentSuggestions] = useState([]);
  const [showEquipmentSuggestions, setShowEquipmentSuggestions] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupSuggestions, setLookupSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  const { data: rmasData, isLoading } = useQuery({
    queryKey: ['rmas', statusFilter, searchQuery],
    queryFn: async () => {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      const response = await rmasApi.getAll(params);
      return response.data;
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['rma-stats'],
    queryFn: async () => {
      const response = await rmasApi.getStats();
      return response.data;
    }
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: async () => {
      const response = await equipmentApi.getAll({ limit: 100 });
      return response.data.equipment;
    }
  });

  const createRMA = useMutation({
    mutationFn: (data) => rmasApi.create(data),
    onSuccess: async (response) => {
      const rmaId = response.data.id;

      // If we have an analyzed image, attach it to the RMA
      if (analyzedImagePath) {
        try {
          // The image is already saved, we just need to link it to the RMA
          await rmasApi.linkImage(rmaId, analyzedImagePath);
        } catch (error) {
          console.error('Failed to link image:', error);
        }
      }

      queryClient.invalidateQueries(['rmas']);
      queryClient.invalidateQueries(['rma-stats']);
      toast.success(`RMA ${response.data.rma_number} created`);
      resetForm();
    }
  });

  const resetForm = () => {
    setShowForm(false);
    setFormData({
      item_name: '',
      serial_number: '',
      part_number: '',
      equipment_id: '',
      reason: '',
      description: ''
    });
    setAnalysisResult(null);
    setPreviewImage(null);
    setAnalyzedImagePath(null);
    setEquipmentSearch('');
    setEquipmentSuggestions([]);
    setSelectedEquipment(null);
  };

  const handleEquipmentSearch = async (value) => {
    setEquipmentSearch(value);
    setShowEquipmentSuggestions(true);

    if (value.length < 2) {
      setEquipmentSuggestions([]);
      return;
    }

    try {
      const response = await equipmentApi.getAll({ search: value, limit: 10 });
      setEquipmentSuggestions(response.data.equipment || []);
    } catch (error) {
      console.error('Failed to search equipment:', error);
      setEquipmentSuggestions([]);
    }
  };

  const selectEquipment = (eq) => {
    setSelectedEquipment(eq);
    setFormData({ ...formData, equipment_id: eq.id });
    setEquipmentSearch(`${eq.serial_number || ''} - ${eq.model || eq.name}`);
    setShowEquipmentSuggestions(false);
  };

  const clearEquipment = () => {
    setSelectedEquipment(null);
    setFormData({ ...formData, equipment_id: '' });
    setEquipmentSearch('');
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewImage(e.target.result);
    reader.readAsDataURL(file);

    // Analyze with AI
    setAnalyzing(true);
    setAnalysisResult(null);
    setAnalyzedImagePath(null);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);

      const response = await rmasApi.analyzeImage(formDataUpload);
      const analysis = response.data.analysis;

      setAnalysisResult(analysis);

      // Save the image path so we can link it to the RMA after creation
      if (response.data.image_path) {
        setAnalyzedImagePath(response.data.image_path);
      }

      // Auto-fill form fields
      if (analysis.item_name) {
        setFormData(prev => ({ ...prev, item_name: analysis.item_name }));
      }
      if (analysis.serial_number) {
        setFormData(prev => ({ ...prev, serial_number: analysis.serial_number }));
      }
      if (analysis.part_number) {
        setFormData(prev => ({ ...prev, part_number: analysis.part_number }));
      }

      toast.success('Image analyzed successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to analyze image');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        // Create a fake event to reuse handleImageUpload
        const fakeEvent = { target: { files: [file] } };
        handleImageUpload(fakeEvent);
      } else {
        toast.error('Please drop an image file');
      }
    }
  };

  const handleModelLookup = async () => {
    const searchTerm = formData.part_number || formData.serial_number;
    if (!searchTerm) {
      toast.error('Please enter a part number or serial number first');
      return;
    }

    setLookingUp(true);
    setLookupSuggestions([]);
    try {
      const response = await rmasApi.lookupModel(null, searchTerm);
      const result = response.data;

      if (result.suggestions && result.suggestions.length > 0) {
        // Check if there's a single high-confidence match
        const highConfidence = result.suggestions.filter(s => s.confidence === 'high');

        if (highConfidence.length === 1) {
          // Auto-select the single high-confidence match
          setFormData(prev => ({
            ...prev,
            item_name: highConfidence[0].item_name,
            part_number: highConfidence[0].part_number || prev.part_number
          }));
          toast.success(`Found: ${highConfidence[0].item_name}`);
        } else {
          // Show selection dialog for multiple options
          setLookupSuggestions(result.suggestions);
          setShowSuggestions(true);
        }
      } else {
        toast.error(result.search_summary || 'No products found for this part number');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to lookup product');
    } finally {
      setLookingUp(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    setFormData(prev => ({
      ...prev,
      item_name: suggestion.item_name,
      part_number: suggestion.part_number || prev.part_number
    }));
    setShowSuggestions(false);
    setLookupSuggestions([]);
    toast.success(`Selected: ${suggestion.item_name}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (!data.equipment_id) delete data.equipment_id;
    createRMA.mutate(data);
  };

  return (
    <div className="space-y-6 page-animate">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">RMA Tracking</h1>
          <p className="page-subtitle">Manage return merchandise authorizations</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New RMA
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const Icon = config.icon;
          const count = stats?.[status] || 0;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={clsx(
                'card p-4 text-center transition-all',
                statusFilter === status && 'ring-2 ring-primary-500'
              )}
            >
              <Icon className={clsx('w-6 h-6 mx-auto mb-2', config.color.split(' ')[0])} />
              <p className="text-2xl font-bold text-dark-900">{count}</p>
              <p className="text-sm text-dark-500">{config.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
            <input
              type="text"
              placeholder="Search RMAs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-12"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <option key={status} value={status}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* RMA List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="card p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
          </div>
        ) : rmasData?.rmas?.length === 0 ? (
          <div className="card p-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-dark-300" />
            <h3 className="text-lg font-semibold text-dark-700">No RMAs found</h3>
            <p className="text-dark-500 mt-1">Create your first RMA to get started</p>
          </div>
        ) : (
          rmasData?.rmas?.map((rma) => {
            const statusConfig = STATUS_CONFIG[rma.status];
            const StatusIcon = statusConfig?.icon || Clock;
            return (
              <Link
                key={rma.id}
                to={`/rmas/${rma.id}`}
                className="card p-5 flex items-center gap-4 hover:shadow-soft-lg transition-all group"
              >
                {/* Thumbnail or status icon */}
                {rma.thumbnail ? (
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-dark-100 flex-shrink-0">
                    <img
                      src={rma.thumbnail}
                      alt={rma.item_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className={clsx(
                    'w-16 h-16 rounded-xl flex items-center justify-center border flex-shrink-0',
                    statusConfig?.color
                  )}>
                    <StatusIcon className="w-7 h-7" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-primary-600">
                      {rma.rma_number}
                    </span>
                    <span className={clsx('badge', statusConfig?.color)}>
                      {statusConfig?.label}
                    </span>
                  </div>
                  <p className="font-medium text-dark-900 truncate mt-1">{rma.item_name}</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-dark-500">
                    {rma.serial_number && <span>S/N: {rma.serial_number}</span>}
                    {rma.part_number && <span>P/N: {rma.part_number}</span>}
                    <span>{new Date(rma.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {rma.image_count > 0 && (
                  <div className="flex items-center gap-1 text-dark-400">
                    <Camera className="w-4 h-4" />
                    <span className="text-sm">{rma.image_count}</span>
                  </div>
                )}
                <ArrowRight className="w-5 h-5 text-dark-400 group-hover:text-primary-600 transition-colors" />
              </Link>
            );
          })
        )}
      </div>

      {/* Create RMA Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">Create New RMA</h2>
              <button onClick={resetForm} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body space-y-5">
              {/* Part Photo */}
              <div>
                <label className="label flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Part Photo
                </label>
                <div className="p-4 rounded-xl bg-dark-50 border border-dark-200">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  {previewImage ? (
                    <div className="relative">
                      <img
                        src={previewImage}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      {analyzing && (
                        <div className="absolute inset-0 bg-dark-900/50 rounded-lg flex items-center justify-center">
                          <div className="text-center text-white">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                            <p className="text-sm">Analyzing with AI...</p>
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewImage(null);
                          setAnalysisResult(null);
                          setAnalyzedImagePath(null);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-dark-900/70 rounded-full text-white hover:bg-dark-900"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={clsx(
                        'w-full py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
                        isDragging
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-dark-300 hover:border-primary-500 hover:bg-white'
                      )}
                    >
                      <Upload className={clsx(
                        'w-10 h-10 mx-auto mb-2',
                        isDragging ? 'text-primary-500' : 'text-dark-400'
                      )} />
                      <p className="text-sm font-medium text-dark-700">
                        {isDragging ? 'Drop image here!' : 'Click or drag to upload part photo'}
                      </p>
                      <p className="text-xs text-dark-500 mt-1">AI will auto-detect part info</p>
                    </div>
                  )}

                  {analysisResult && (
                    <div className="mt-3 p-3 bg-gradient-to-br from-primary-50 to-accent-50 rounded-lg border border-primary-100">
                      <p className="text-sm font-medium text-primary-700 flex items-center gap-1 mb-2">
                        <Sparkles className="w-4 h-4" />
                        AI detected information (auto-filled)
                      </p>
                      <div className="text-sm text-dark-600 space-y-1">
                        {analysisResult.item_name && <p>Item: {analysisResult.item_name}</p>}
                        {analysisResult.serial_number && <p>Serial: {analysisResult.serial_number}</p>}
                        {analysisResult.part_number && <p>Part #: {analysisResult.part_number}</p>}
                        {analysisResult.manufacturer && <p>Manufacturer: {analysisResult.manufacturer}</p>}
                        {analysisResult.condition && <p>Condition: {analysisResult.condition}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Item Name *</label>
                  <input
                    type="text"
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    className="input"
                    placeholder="e.g., Power Supply Unit"
                    required
                  />
                </div>

                <div>
                  <label className="label">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    className="input font-mono"
                    placeholder="S/N"
                  />
                </div>

                <div>
                  <label className="label">Part Number</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.part_number}
                      onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                      className="input font-mono flex-1"
                      placeholder="P/N"
                    />
                    <button
                      type="button"
                      onClick={handleModelLookup}
                      disabled={lookingUp || (!formData.part_number && !formData.serial_number)}
                      className="btn btn-secondary flex items-center gap-1 px-3"
                      title="AI Lookup - Find item name from part/serial number"
                    >
                      {lookingUp ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Link to Equipment (Optional)</label>
                  <div className="relative">
                    {selectedEquipment ? (
                      <div className="input flex items-center justify-between bg-primary-50 border-primary-200">
                        <div>
                          <span className="font-medium text-dark-900">{selectedEquipment.name}</span>
                          <span className="text-dark-500 ml-2">
                            {selectedEquipment.serial_number && `S/N: ${selectedEquipment.serial_number}`}
                            {selectedEquipment.model && ` • ${selectedEquipment.model}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={clearEquipment}
                          className="p-1 hover:bg-primary-100 rounded"
                        >
                          <X className="w-4 h-4 text-dark-500" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={equipmentSearch}
                          onChange={(e) => handleEquipmentSearch(e.target.value)}
                          onFocus={() => equipmentSearch.length >= 2 && setShowEquipmentSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowEquipmentSuggestions(false), 200)}
                          className="input"
                          placeholder="Type serial number or model to search..."
                        />
                        {showEquipmentSuggestions && equipmentSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-dark-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {equipmentSuggestions.map((eq) => (
                              <button
                                key={eq.id}
                                type="button"
                                onClick={() => selectEquipment(eq)}
                                className="w-full px-4 py-3 text-left hover:bg-dark-50 border-b border-dark-100 last:border-0"
                              >
                                <div className="font-medium text-dark-900">{eq.name}</div>
                                <div className="text-sm text-dark-500">
                                  {eq.serial_number && <span>S/N: {eq.serial_number}</span>}
                                  {eq.model && <span className="ml-2">Model: {eq.model}</span>}
                                  {eq.location && <span className="ml-2">• {eq.location}</span>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {showEquipmentSuggestions && equipmentSearch.length >= 2 && equipmentSuggestions.length === 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-dark-200 rounded-lg shadow-lg p-4 text-center text-dark-500">
                            No equipment found
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Reason for RMA *</label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="input"
                    placeholder="Brief reason for return"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Detailed description of the issue..."
                  />
                </div>
              </div>
            </form>

            <div className="modal-footer">
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={createRMA.isPending || !formData.item_name || !formData.reason}
                className="btn btn-primary flex items-center gap-2"
              >
                {createRMA.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                Create RMA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Part Number Suggestions Modal */}
      {showSuggestions && (
        <div className="modal-overlay" onClick={() => setShowSuggestions(false)}>
          <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                Select Product
              </h2>
              <button onClick={() => setShowSuggestions(false)} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <p className="text-sm text-dark-500 mb-4">
                Multiple products found. Select the correct one:
              </p>

              <div className="space-y-3">
                {lookupSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => selectSuggestion(suggestion)}
                    className="w-full p-4 text-left border border-dark-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-dark-900">{suggestion.item_name}</span>
                          <span className={clsx(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            suggestion.confidence === 'high' && 'bg-success-100 text-success-700',
                            suggestion.confidence === 'medium' && 'bg-warning-100 text-warning-700',
                            suggestion.confidence === 'low' && 'bg-dark-100 text-dark-600'
                          )}>
                            {suggestion.confidence}
                          </span>
                        </div>
                        {suggestion.manufacturer && (
                          <p className="text-sm text-dark-600">
                            Manufacturer: {suggestion.manufacturer}
                          </p>
                        )}
                        {suggestion.part_number && (
                          <p className="text-sm text-dark-500 font-mono">
                            P/N: {suggestion.part_number}
                          </p>
                        )}
                      </div>
                      {suggestion.source_url && (
                        <a
                          href={suggestion.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 text-dark-400 hover:text-primary-600 hover:bg-white rounded-lg"
                          title="View source"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {lookupSuggestions.length === 0 && (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-dark-300" />
                  <p className="text-dark-500">No matching products found</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setShowSuggestions(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RMAs;
