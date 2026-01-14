import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { rmasApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Printer,
  Camera,
  Upload,
  Loader2,
  CheckCircle,
  Clock,
  Truck,
  PackageCheck,
  Send,
  Trash2,
  Edit,
  Save,
  X,
  Package,
  History,
  MessageSquare,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-warning-600 bg-warning-50 border-warning-200', next: 'shipped' },
  shipped: { label: 'Shipped', icon: Truck, color: 'text-accent-600 bg-accent-50 border-accent-200', next: 'received' },
  received: { label: 'Received', icon: PackageCheck, color: 'text-success-600 bg-success-50 border-success-200', next: 'complete' },
  complete: { label: 'Complete', icon: CheckCircle, color: 'text-success-600 bg-success-50 border-success-200', next: null }
};

const RESOLUTIONS = [
  { value: 'replaced', label: 'Replaced' },
  { value: 'repaired', label: 'Repaired' },
  { value: 'returned', label: 'Returned' }
];

function RMADetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const fileInputRef = useRef(null);
  const printRef = useRef(null);

  const [editing, setEditing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editData, setEditData] = useState({});
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');

  const canEdit = user?.role === 'admin' || user?.role === 'technician';
  const isAdmin = user?.role === 'admin';

  const { data: rma, isLoading } = useQuery({
    queryKey: ['rma', id],
    queryFn: async () => {
      const response = await rmasApi.getOne(id);
      return response.data;
    }
  });

  const updateRMA = useMutation({
    mutationFn: (data) => rmasApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['rma', id]);
      setEditing(false);
      toast.success('RMA updated');
    }
  });

  const updateStatus = useMutation({
    mutationFn: (status) => rmasApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries(['rma', id]);
      queryClient.invalidateQueries(['rmas']);
      queryClient.invalidateQueries(['rma-stats']);
      toast.success('Status updated');
    }
  });

  const uploadImage = useMutation({
    mutationFn: (formData) => rmasApi.uploadImage(id, formData),
    onSuccess: () => {
      queryClient.invalidateQueries(['rma', id]);
      toast.success('Image uploaded');
    }
  });

  const addNote = useMutation({
    mutationFn: (content) => rmasApi.addNote(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries(['rma', id]);
      setNewNote('');
      toast.success('Note added');
    }
  });

  const deleteRMA = useMutation({
    mutationFn: () => rmasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['rmas']);
      toast.success('RMA deleted');
      navigate('/rmas');
    }
  });

  const checkTracking = useMutation({
    mutationFn: () => rmasApi.checkTracking(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['rma', id]);
      queryClient.invalidateQueries(['rmas']);
      if (response.data.updated) {
        toast.success(`Package delivered! RMA updated to received status.`);
      } else {
        toast.success(`Tracking checked: ${response.data.tracking_status?.status || 'Status unknown'}`);
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to check tracking');
    }
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);
    uploadImage.mutate(formData);
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    const originalContents = document.body.innerHTML;

    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
  };

  const startEdit = () => {
    setEditData({
      item_name: rma.item_name,
      serial_number: rma.serial_number || '',
      part_number: rma.part_number || '',
      manufacturer: rma.manufacturer || '',
      reason: rma.reason,
      description: rma.description || '',
      resolution: rma.resolution || '',
      resolution_notes: rma.resolution_notes || '',
      tracking_number: rma.tracking_number || '',
      manufacturer_rma_number: rma.manufacturer_rma_number || '',
      contact_name: rma.contact_name || '',
      contact_email: rma.contact_email || '',
      contact_phone: rma.contact_phone || '',
      shipped_at: rma.shipped_at || null
    });
    setEditing(true);
  };

  // Calculate days out (from shipped to received, or from shipped to now)
  const calculateDaysOut = () => {
    if (!rma.shipped_at) return null;
    const shippedDate = new Date(rma.shipped_at);
    const endDate = rma.received_at ? new Date(rma.received_at) : new Date();
    const diffTime = Math.abs(endDate - shippedDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Generate tracking URL based on tracking number format
  const getTrackingUrl = (trackingNumber) => {
    if (!trackingNumber) return null;
    const num = trackingNumber.replace(/\s+/g, '').toUpperCase();

    // USPS patterns
    if (/^9[2-5]\d{20}$/.test(num) || /^[A-Z]{2}\d{9}US$/.test(num) || /^420\d{27}$/.test(num)) {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`;
    }
    // UPS patterns
    if (/^1Z[A-Z0-9]{16}$/.test(num) || /^T\d{10}$/.test(num)) {
      return `https://www.ups.com/track?tracknum=${num}`;
    }
    // FedEx patterns
    if (/^\d{12,15}$/.test(num) || /^\d{20}$/.test(num) || /^(96|98)\d{20}$/.test(num)) {
      return `https://www.fedex.com/fedextrack/?trknbr=${num}`;
    }
    // DHL patterns
    if (/^\d{10,11}$/.test(num) || /^[A-Z]{3}\d{7}$/.test(num)) {
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${num}`;
    }
    // Default to Google search
    return `https://www.google.com/search?q=track+package+${num}`;
  };

  const saveEdit = () => {
    updateRMA.mutate(editData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!rma) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 mx-auto mb-4 text-dark-300" />
        <h2 className="text-xl font-semibold text-dark-700">RMA not found</h2>
        <Link to="/rmas" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to RMAs
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[rma.status];
  const StatusIcon = statusConfig?.icon || Clock;

  return (
    <div className="space-y-6 page-animate">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/rmas" className="btn-icon">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title font-mono">{rma.rma_number}</h1>
              <span className={clsx('badge', statusConfig?.color)}>
                {statusConfig?.label}
              </span>
            </div>
            <p className="text-dark-500 mt-1">{rma.item_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="btn btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Print
          </button>
          {canEdit && !editing && (
            <button onClick={startEdit} className="btn btn-secondary flex items-center gap-2">
              <Edit className="w-4 h-4" />
              Edit
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this RMA?')) {
                  deleteRMA.mutate();
                }
              }}
              className="btn btn-danger flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Progress */}
          <div className="card p-6">
            <h3 className="font-semibold text-dark-900 mb-4">Status Progress</h3>
            <div className="flex items-center justify-between">
              {['pending', 'shipped', 'received', 'complete'].map((status, idx) => {
                const config = STATUS_CONFIG[status];
                const Icon = config.icon;
                const isActive = rma.status === status;
                const isPast = ['pending', 'shipped', 'received', 'complete'].indexOf(rma.status) > idx;

                return (
                  <div key={status} className="flex items-center flex-1">
                    <div className={clsx(
                      'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                      isActive && 'border-primary-500 bg-primary-50 text-primary-600',
                      isPast && 'border-success-500 bg-success-50 text-success-600',
                      !isActive && !isPast && 'border-dark-200 bg-dark-50 text-dark-400'
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    {idx < 3 && (
                      <div className={clsx(
                        'flex-1 h-1 mx-2',
                        isPast ? 'bg-success-500' : 'bg-dark-200'
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-dark-500">
              <span>Pending</span>
              <span>Shipped</span>
              <span>Received</span>
              <span>Complete</span>
            </div>

            {/* Status Actions */}
            {canEdit && statusConfig?.next && (
              <div className="mt-6 pt-4 border-t border-dark-100 flex items-center gap-3">
                <button
                  onClick={() => {
                    // If moving to shipped status, show tracking modal
                    if (statusConfig.next === 'shipped') {
                      setTrackingNumber(rma.tracking_number || '');
                      setShowShippingModal(true);
                    } else {
                      updateStatus.mutate(statusConfig.next);
                    }
                  }}
                  disabled={updateStatus.isPending}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {updateStatus.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Mark as {STATUS_CONFIG[statusConfig.next]?.label}
                </button>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="card p-6">
            <h3 className="font-semibold text-dark-900 mb-4">RMA Details</h3>

            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Item Name</label>
                    <input
                      type="text"
                      value={editData.item_name}
                      onChange={(e) => setEditData({ ...editData, item_name: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Serial Number</label>
                    <input
                      type="text"
                      value={editData.serial_number}
                      onChange={(e) => setEditData({ ...editData, serial_number: e.target.value })}
                      className="input font-mono"
                    />
                  </div>
                  <div>
                    <label className="label">Part Number</label>
                    <input
                      type="text"
                      value={editData.part_number}
                      onChange={(e) => setEditData({ ...editData, part_number: e.target.value })}
                      className="input font-mono"
                    />
                  </div>
                  <div>
                    <label className="label">Manufacturer</label>
                    <input
                      type="text"
                      value={editData.manufacturer}
                      onChange={(e) => setEditData({ ...editData, manufacturer: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Tracking Number</label>
                    <input
                      type="text"
                      value={editData.tracking_number}
                      onChange={(e) => setEditData({ ...editData, tracking_number: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Ship Date</label>
                    <input
                      type="date"
                      value={editData.shipped_at ? new Date(editData.shipped_at).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditData({ ...editData, shipped_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Manufacturer RMA #</label>
                    <input
                      type="text"
                      value={editData.manufacturer_rma_number}
                      onChange={(e) => setEditData({ ...editData, manufacturer_rma_number: e.target.value })}
                      className="input font-mono"
                      placeholder="RMA # from manufacturer"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Reason</label>
                  <input
                    type="text"
                    value={editData.reason}
                    onChange={(e) => setEditData({ ...editData, reason: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea
                    value={editData.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="input"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="label">Resolution</label>
                  <select
                    value={editData.resolution}
                    onChange={(e) => setEditData({ ...editData, resolution: e.target.value })}
                    className="input"
                  >
                    <option value="">Select resolution...</option>
                    {RESOLUTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Resolution Notes</label>
                  <textarea
                    value={editData.resolution_notes}
                    onChange={(e) => setEditData({ ...editData, resolution_notes: e.target.value })}
                    className="input"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-dark-200">
                  <div>
                    <label className="label">Contact Name</label>
                    <input
                      type="text"
                      value={editData.contact_name}
                      onChange={(e) => setEditData({ ...editData, contact_name: e.target.value })}
                      className="input"
                      placeholder="Manufacturer contact"
                    />
                  </div>
                  <div>
                    <label className="label">Contact Email</label>
                    <input
                      type="email"
                      value={editData.contact_email}
                      onChange={(e) => setEditData({ ...editData, contact_email: e.target.value })}
                      className="input"
                      placeholder="email@manufacturer.com"
                    />
                  </div>
                  <div>
                    <label className="label">Contact Phone</label>
                    <input
                      type="text"
                      value={editData.contact_phone}
                      onChange={(e) => setEditData({ ...editData, contact_phone: e.target.value })}
                      className="input"
                      placeholder="Phone number"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveEdit} className="btn btn-primary flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button onClick={() => setEditing(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-dark-500">Serial Number</dt>
                  <dd className="font-mono font-medium text-dark-900">{rma.serial_number || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-dark-500">Part Number</dt>
                  <dd className="font-mono font-medium text-dark-900">{rma.part_number || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-dark-500">Manufacturer</dt>
                  <dd className="font-medium text-dark-900">{rma.manufacturer || '-'}</dd>
                </div>
                {rma.manufacturer_rma_number && (
                  <div>
                    <dt className="text-sm text-dark-500">Manufacturer RMA #</dt>
                    <dd className="font-mono font-medium text-primary-600">{rma.manufacturer_rma_number}</dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-sm text-dark-500">Reason</dt>
                  <dd className="font-medium text-dark-900">{rma.reason}</dd>
                </div>
                {rma.description && (
                  <div className="col-span-2">
                    <dt className="text-sm text-dark-500">Description</dt>
                    <dd className="text-dark-700 whitespace-pre-wrap">{rma.description}</dd>
                  </div>
                )}
                {rma.tracking_number && (
                  <div>
                    <dt className="text-sm text-dark-500">Tracking Number</dt>
                    <dd className="font-mono font-medium text-dark-900 flex items-center gap-2">
                      <a
                        href={getTrackingUrl(rma.tracking_number)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                      >
                        {rma.tracking_number}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {canEdit && rma.status === 'shipped' && (
                        <button
                          onClick={() => checkTracking.mutate()}
                          disabled={checkTracking.isPending}
                          className="p-1 hover:bg-dark-100 rounded text-dark-500 hover:text-primary-600"
                          title="Check tracking status"
                        >
                          {checkTracking.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </dd>
                  </div>
                )}
                {rma.resolution && (
                  <div>
                    <dt className="text-sm text-dark-500">Resolution</dt>
                    <dd className="capitalize font-medium text-dark-900">{rma.resolution}</dd>
                  </div>
                )}
                {rma.resolution_notes && (
                  <div className="col-span-2">
                    <dt className="text-sm text-dark-500">Resolution Notes</dt>
                    <dd className="text-dark-700">{rma.resolution_notes}</dd>
                  </div>
                )}
                {(rma.contact_name || rma.contact_email || rma.contact_phone) && (
                  <div className="col-span-2 pt-4 border-t border-dark-100">
                    <dt className="text-sm text-dark-500 mb-2">Manufacturer Contact</dt>
                    <dd className="text-dark-700 space-y-1">
                      {rma.contact_name && <p className="font-medium">{rma.contact_name}</p>}
                      {rma.contact_email && <p><a href={`mailto:${rma.contact_email}`} className="text-primary-600 hover:underline">{rma.contact_email}</a></p>}
                      {rma.contact_phone && <p>{rma.contact_phone}</p>}
                    </dd>
                  </div>
                )}
                {calculateDaysOut() !== null && (
                  <div>
                    <dt className="text-sm text-dark-500">Days Out</dt>
                    <dd className="font-medium text-dark-900">
                      {calculateDaysOut()} days
                      {!rma.received_at && <span className="text-warning-600 ml-1">(ongoing)</span>}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Images */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-dark-900">Images</h3>
              {canEdit && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadImage.isPending}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    {uploadImage.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    Add Image
                  </button>
                </>
              )}
            </div>

            {rma.images?.length === 0 ? (
              <div className="text-center py-8 text-dark-500">
                <Camera className="w-12 h-12 mx-auto mb-2 text-dark-300" />
                <p>No images uploaded</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {rma.images?.map((img) => (
                  <a
                    key={img.id}
                    href={img.file_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-xl overflow-hidden bg-dark-100 hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={img.file_path}
                      alt={img.original_name}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card p-6">
            <h3 className="font-semibold text-dark-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Notes
            </h3>

            {canEdit && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  className="input flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && newNote && addNote.mutate(newNote)}
                />
                <button
                  onClick={() => newNote && addNote.mutate(newNote)}
                  disabled={!newNote || addNote.isPending}
                  className="btn btn-primary"
                >
                  {addNote.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {rma.notes?.length === 0 ? (
                <p className="text-dark-500 text-center py-4">No notes yet</p>
              ) : (
                rma.notes?.map((note) => (
                  <div key={note.id} className="p-3 bg-dark-50 rounded-lg">
                    <p className="text-dark-700">{note.content}</p>
                    <p className="text-xs text-dark-400 mt-1">
                      {note.user_name} · {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Timestamps */}
          <div className="card p-6">
            <h3 className="font-semibold text-dark-900 mb-4">Timeline</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-dark-500">Created</p>
                <p className="font-medium">{new Date(rma.created_at).toLocaleString()}</p>
                <p className="text-dark-500">by {rma.created_by_name}</p>
              </div>
              {rma.shipped_at && (
                <div>
                  <p className="text-dark-500">Shipped</p>
                  <p className="font-medium">{new Date(rma.shipped_at).toLocaleString()}</p>
                </div>
              )}
              {rma.received_at && (
                <div>
                  <p className="text-dark-500">Received</p>
                  <p className="font-medium">{new Date(rma.received_at).toLocaleString()}</p>
                </div>
              )}
              {rma.completed_at && (
                <div>
                  <p className="text-dark-500">Completed</p>
                  <p className="font-medium">{new Date(rma.completed_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="card p-6">
            <h3 className="font-semibold text-dark-900 mb-4 flex items-center gap-2">
              <History className="w-5 h-5" />
              History
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {rma.history?.map((entry) => (
                <div key={entry.id} className="text-sm border-l-2 border-dark-200 pl-3">
                  <p className="font-medium text-dark-900 capitalize">
                    {entry.action.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-dark-500">
                    {entry.user_name} · {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Printable Form (Hidden) */}
      <div ref={printRef} className="hidden">
        <style>{`
          @media print {
            @page { size: letter; margin: 0.4in; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 11px; }
            .rma-form { max-width: 100%; margin: 0 auto; }
            .rma-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
            .rma-title { font-size: 18px; font-weight: bold; }
            .rma-number { font-size: 24px; font-family: monospace; margin: 4px 0; }
            .rma-section { margin-bottom: 10px; page-break-inside: avoid; }
            .rma-section-title { font-weight: bold; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 6px; }
            .rma-row { display: flex; margin-bottom: 4px; line-height: 1.3; }
            .rma-label { width: 150px; font-weight: bold; font-size: 10px; }
            .rma-value { flex: 1; font-size: 10px; }
            .rma-value-box { flex: 1; border-bottom: 1px solid #999; min-height: 14px; }
            .rma-description { border: 1px solid #ccc; padding: 6px; min-height: 40px; max-height: 80px; overflow: hidden; margin-top: 3px; font-size: 10px; }
            .rma-footer { text-align: center; margin-top: 15px; font-size: 9px; color: #666; border-top: 1px solid #ccc; padding-top: 8px; }
            .rma-dates { display: flex; gap: 20px; margin-top: 10px; }
            .rma-date-box { flex: 1; }
            .rma-checkbox { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; margin-right: 6px; vertical-align: middle; }
            .rma-checkbox.checked { background: #000; }
            .rma-notes-compact { font-size: 9px; max-height: 120px; overflow: hidden; }
            .rma-notes-compact > div { margin-bottom: 4px; padding-left: 6px; border-left: 2px solid #ccc; }
          }
        `}</style>
        <div className="rma-form">
          <div className="rma-header">
            <div className="rma-title">TMRW Sports</div>
            <div className="rma-number">{rma.rma_number}</div>
            <div>RMA Details</div>
          </div>

          <div className="rma-section" style={{ backgroundColor: '#f5f5f5', padding: '8px', marginBottom: '12px' }}>
            <div className="rma-section-title">Return Address</div>
            <div style={{ lineHeight: '1.4', fontSize: '11px' }}>
              <div><strong>SoFi Center</strong></div>
              <div>Colin DeFord</div>
              <div>2961 RCA BLVD</div>
              <div>Palm Beach Gardens, FL 33410</div>
              <div>(435) 200-4744</div>
            </div>
          </div>

          <div className="rma-section">
            <div className="rma-section-title">Item Information</div>
            <div className="rma-row">
              <div className="rma-label">Item Name:</div>
              <div className="rma-value">{rma.item_name}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Manufacturer:</div>
              <div className="rma-value">{rma.manufacturer || 'N/A'}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Serial Number:</div>
              <div className="rma-value">{rma.serial_number || 'N/A'}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Part Number:</div>
              <div className="rma-value">{rma.part_number || 'N/A'}</div>
            </div>
          </div>

          <div className="rma-section">
            <div className="rma-section-title">RMA Information</div>
            <div className="rma-row">
              <div className="rma-label">Manufacturer RMA #:</div>
              <div className="rma-value">{rma.manufacturer_rma_number || <span className="rma-value-box"></span>}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Reason:</div>
              <div className="rma-value">{rma.reason}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Tracking Number:</div>
              <div className="rma-value">{rma.tracking_number || <span className="rma-value-box"></span>}</div>
            </div>
            {calculateDaysOut() !== null && (
              <div className="rma-row">
                <div className="rma-label">Days Out:</div>
                <div className="rma-value">{calculateDaysOut()} days {!rma.received_at && '(ongoing)'}</div>
              </div>
            )}
          </div>

          {(rma.contact_name || rma.contact_email || rma.contact_phone) && (
            <div className="rma-section">
              <div className="rma-section-title">Manufacturer Contact</div>
              {rma.contact_name && (
                <div className="rma-row">
                  <div className="rma-label">Contact Name:</div>
                  <div className="rma-value">{rma.contact_name}</div>
                </div>
              )}
              {rma.contact_email && (
                <div className="rma-row">
                  <div className="rma-label">Email:</div>
                  <div className="rma-value">{rma.contact_email}</div>
                </div>
              )}
              {rma.contact_phone && (
                <div className="rma-row">
                  <div className="rma-label">Phone:</div>
                  <div className="rma-value">{rma.contact_phone}</div>
                </div>
              )}
            </div>
          )}

          <div className="rma-section">
            <div className="rma-section-title">Description</div>
            <div className="rma-description">{rma.description || ''}</div>
          </div>

          <div className="rma-section">
            <div className="rma-section-title">Shipping Status</div>
            <div className="rma-row">
              <div className="rma-label">
                <span className={`rma-checkbox ${rma.shipped_at ? 'checked' : ''}`}></span>
                Shipped to Manufacturer
              </div>
              <div className="rma-value">
                {rma.shipped_at ? new Date(rma.shipped_at).toLocaleDateString() : '________________'}
              </div>
            </div>
            <div className="rma-row">
              <div className="rma-label">
                <span className={`rma-checkbox ${rma.received_at ? 'checked' : ''}`}></span>
                Returned from Manufacturer
              </div>
              <div className="rma-value">
                {rma.received_at ? new Date(rma.received_at).toLocaleDateString() : '________________'}
              </div>
            </div>
          </div>

          {rma.resolution && (
            <div className="rma-section">
              <div className="rma-section-title">Resolution</div>
              <div className="rma-row">
                <div className="rma-label">Resolution:</div>
                <div className="rma-value" style={{ textTransform: 'capitalize' }}>{rma.resolution}</div>
              </div>
              {rma.resolution_notes && (
                <div className="rma-row">
                  <div className="rma-label">Notes:</div>
                  <div className="rma-value">{rma.resolution_notes}</div>
                </div>
              )}
            </div>
          )}

          {rma.notes?.length > 0 && (
            <div className="rma-section">
              <div className="rma-section-title">Notes ({rma.notes.length})</div>
              <div className="rma-notes-compact">
                {rma.notes.slice(0, 3).map((note, idx) => (
                  <div key={idx}>
                    <span style={{ color: '#666' }}>{note.user_name} ({new Date(note.created_at).toLocaleDateString()}):</span> {note.content}
                  </div>
                ))}
                {rma.notes.length > 3 && (
                  <div style={{ color: '#999', fontStyle: 'italic' }}>+ {rma.notes.length - 3} more notes</div>
                )}
              </div>
            </div>
          )}

          <div className="rma-footer">
            <p>Internal RMA #: {rma.rma_number} | Created: {new Date(rma.created_at).toLocaleDateString()} by {rma.created_by_name}</p>
            <p>Printed: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Shipping Modal */}
      {showShippingModal && (
        <div className="modal-overlay" onClick={() => setShowShippingModal(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary-600" />
                Mark as Shipped
              </h2>
              <button onClick={() => setShowShippingModal(false)} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body space-y-4">
              <div>
                <label className="label">Tracking Number</label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="input font-mono"
                  placeholder="Enter tracking number"
                  autoFocus
                />
                <p className="text-sm text-dark-500 mt-1">
                  Enter the tracking number to enable automatic delivery tracking
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setShowShippingModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // First update tracking number if provided
                  if (trackingNumber && trackingNumber !== rma.tracking_number) {
                    await rmasApi.update(id, { tracking_number: trackingNumber });
                  }
                  // Then update status
                  updateStatus.mutate('shipped');
                  setShowShippingModal(false);
                }}
                disabled={updateStatus.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                {updateStatus.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
                {trackingNumber ? 'Ship with Tracking' : 'Ship without Tracking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RMADetail;
