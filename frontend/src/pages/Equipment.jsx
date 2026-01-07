import { useState } from 'react';
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
  Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

function Equipment() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
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
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Equipment
          </button>
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
    </div>
  );
}

export default Equipment;
