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
  Sparkles
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

  const { data: equipmentData, isLoading } = useQuery({
    queryKey: ['equipment', page, search],
    queryFn: async () => {
      const params = { page, limit: 12 };
      if (search) params.search = search;
      const response = await equipmentApi.getAll(params);
      return response.data;
    },
  });

  const { data: locations } = useQuery({
    queryKey: ['equipment-locations'],
    queryFn: async () => {
      const response = await equipmentApi.getLocations();
      return response.data.locations;
    },
  });

  const createEquipment = useMutation({
    mutationFn: (data) => equipmentApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['equipment']);
      resetForm();
      toast.success('Equipment added');
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

    // Validate that name is mapped
    const mappedFields = Object.values(columnMappings);
    if (!mappedFields.includes('name')) {
      toast.error('You must map the Equipment Name field');
      return;
    }

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
    name: 'Name (Required)',
    model: 'Model',
    serial_number: 'Serial Number',
    manufacturer: 'Manufacturer',
    location: 'Location',
    description: 'Description'
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

      {/* Search */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, model, or serial number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-10"
          />
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
            <div key={eq.id} className="card hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <Monitor className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{eq.name}</h3>
                      <p className="text-sm text-gray-500">{eq.model || 'No model'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowQR(eq)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="Show QR Code"
                  >
                    <QrCode className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  {eq.serial_number && (
                    <p className="text-gray-500">
                      <span className="font-medium">S/N:</span> {eq.serial_number}
                    </p>
                  )}
                  {eq.location && (
                    <p className="flex items-center gap-1 text-gray-500">
                      <MapPin className="w-4 h-4" />
                      {eq.location}
                    </p>
                  )}
                  {/* Custom fields */}
                  {eq.custom_fields && Object.keys(eq.custom_fields).length > 0 && (
                    <div className="pt-2 border-t border-gray-100 space-y-1">
                      {Object.entries(eq.custom_fields).slice(0, 3).map(([key, value]) => (
                        <p key={key} className="text-gray-500 truncate">
                          <span className="font-medium">{key}:</span> {value}
                        </p>
                      ))}
                      {Object.keys(eq.custom_fields).length > 3 && (
                        <p className="text-gray-400 text-xs">+{Object.keys(eq.custom_fields).length - 3} more fields</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs">
                  {eq.open_issue_count > 0 ? (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertCircle className="w-4 h-4" />
                      {eq.open_issue_count} open issue{eq.open_issue_count > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-green-600">No open issues</span>
                  )}
                  <span className="text-gray-400">{eq.issue_count || 0} total issues</span>
                </div>
              </div>

              <div className="px-4 py-3 border-t flex items-center justify-between">
                <Link
                  to={`/issues?equipment=${eq.id}`}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  View Issues
                </Link>
                {canEdit && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(eq)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Remove this equipment?')) deleteEquipment.mutate(eq.id);
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg"
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
