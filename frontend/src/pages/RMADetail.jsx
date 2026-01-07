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
  XCircle,
  Send,
  Trash2,
  Edit,
  Save,
  X,
  Package,
  History,
  MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-warning-600 bg-warning-50 border-warning-200', next: 'approved' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'text-primary-600 bg-primary-50 border-primary-200', next: 'shipped' },
  shipped: { label: 'Shipped', icon: Truck, color: 'text-accent-600 bg-accent-50 border-accent-200', next: 'received' },
  received: { label: 'Received', icon: PackageCheck, color: 'text-success-600 bg-success-50 border-success-200', next: 'complete' },
  complete: { label: 'Complete', icon: CheckCircle, color: 'text-success-600 bg-success-50 border-success-200', next: null },
  rejected: { label: 'Rejected', icon: XCircle, color: 'text-danger-600 bg-danger-50 border-danger-200', next: null }
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
      toast.success('RMA deleted');
      navigate('/rmas');
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
      reason: rma.reason,
      description: rma.description || '',
      resolution: rma.resolution || '',
      resolution_notes: rma.resolution_notes || '',
      tracking_number: rma.tracking_number || ''
    });
    setEditing(true);
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
              {['pending', 'approved', 'shipped', 'received', 'complete'].map((status, idx) => {
                const config = STATUS_CONFIG[status];
                const Icon = config.icon;
                const isActive = rma.status === status;
                const isPast = ['pending', 'approved', 'shipped', 'received', 'complete'].indexOf(rma.status) > idx;
                const isRejected = rma.status === 'rejected';

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
                    {idx < 4 && (
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
              <span>Approved</span>
              <span>Shipped</span>
              <span>Received</span>
              <span>Complete</span>
            </div>

            {/* Status Actions */}
            {canEdit && statusConfig?.next && rma.status !== 'rejected' && (
              <div className="mt-6 pt-4 border-t border-dark-100 flex items-center gap-3">
                <button
                  onClick={() => updateStatus.mutate(statusConfig.next)}
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
                {rma.status === 'pending' && (
                  <button
                    onClick={() => updateStatus.mutate('rejected')}
                    disabled={updateStatus.isPending}
                    className="btn btn-danger flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                )}
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
                    <label className="label">Tracking Number</label>
                    <input
                      type="text"
                      value={editData.tracking_number}
                      onChange={(e) => setEditData({ ...editData, tracking_number: e.target.value })}
                      className="input"
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
                    <dd className="font-mono font-medium text-dark-900">{rma.tracking_number}</dd>
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
              {rma.approved_at && (
                <div>
                  <p className="text-dark-500">Approved</p>
                  <p className="font-medium">{new Date(rma.approved_at).toLocaleString()}</p>
                </div>
              )}
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
            body { font-family: Arial, sans-serif; padding: 20px; }
            .rma-form { max-width: 800px; margin: 0 auto; }
            .rma-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
            .rma-title { font-size: 24px; font-weight: bold; }
            .rma-number { font-size: 32px; font-family: monospace; margin: 10px 0; }
            .rma-section { margin-bottom: 20px; }
            .rma-section-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; }
            .rma-row { display: flex; margin-bottom: 10px; }
            .rma-label { width: 150px; font-weight: bold; }
            .rma-value { flex: 1; }
            .rma-description { border: 1px solid #ccc; padding: 10px; min-height: 100px; margin-top: 5px; }
            .rma-signature { margin-top: 40px; display: flex; justify-content: space-between; }
            .rma-signature-line { width: 200px; border-top: 1px solid #000; padding-top: 5px; text-align: center; }
            .rma-footer { text-align: center; margin-top: 40px; font-size: 12px; color: #666; }
          }
        `}</style>
        <div className="rma-form">
          <div className="rma-header">
            <div className="rma-title">TMRW Sports</div>
            <div className="rma-number">{rma.rma_number}</div>
            <div>Return Merchandise Authorization</div>
          </div>

          <div className="rma-section">
            <div className="rma-section-title">Item Information</div>
            <div className="rma-row">
              <div className="rma-label">Item Name:</div>
              <div className="rma-value">{rma.item_name}</div>
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
            <div className="rma-section-title">RMA Details</div>
            <div className="rma-row">
              <div className="rma-label">Status:</div>
              <div className="rma-value">{statusConfig?.label}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Reason:</div>
              <div className="rma-value">{rma.reason}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Created By:</div>
              <div className="rma-value">{rma.created_by_name}</div>
            </div>
            <div className="rma-row">
              <div className="rma-label">Created Date:</div>
              <div className="rma-value">{new Date(rma.created_at).toLocaleDateString()}</div>
            </div>
            {rma.tracking_number && (
              <div className="rma-row">
                <div className="rma-label">Tracking #:</div>
                <div className="rma-value">{rma.tracking_number}</div>
              </div>
            )}
          </div>

          <div className="rma-section">
            <div className="rma-section-title">Description</div>
            <div className="rma-description">{rma.description || 'No description provided'}</div>
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

          <div className="rma-signature">
            <div className="rma-signature-line">Signature</div>
            <div className="rma-signature-line">Date</div>
          </div>

          <div className="rma-footer">
            <p>Please include this form with your return shipment.</p>
            <p>Printed: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RMADetail;
