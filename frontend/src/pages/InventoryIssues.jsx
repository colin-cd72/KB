import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { inventoryApi, equipmentApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertTriangle,
  Tags,
  Tag,
  Copy,
  Type,
  Hash,
  Loader2,
  Check,
  Trash2,
  Save,
  Info,
  ScanLine
} from 'lucide-react';

function InventoryIssues() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['inventory-issues'],
    queryFn: async () => {
      const response = await inventoryApi.getIssues();
      return response.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries(['inventory-issues']);

  // --- Tag collisions ---
  const [selectedByTag, setSelectedByTag] = useState({});

  const resolveCollision = useMutation({
    mutationFn: ({ tag, keep_id }) => inventoryApi.resolveCollision(tag, keep_id),
    onSuccess: (res, variables) => {
      invalidate();
      const cleared = res?.data?.cleared ?? 0;
      toast.success(`Kept the selected unit for tag "${variables.tag}" — cleared ${cleared} other record${cleared === 1 ? '' : 's'}`);
      setSelectedByTag((prev) => {
        const next = { ...prev };
        delete next[variables.tag];
        return next;
      });
    },
    onError: (err) => {
      if (err.response?.status === 409) {
        invalidate();
        toast.error('That unit no longer holds this tag — list refreshed, please try again.');
      } else {
        toast.error(err.response?.data?.error || 'Failed');
      }
    },
  });

  // --- Duplicate serials: delete a record ---
  const deleteDuplicate = useMutation({
    mutationFn: (id) => equipmentApi.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Record removed');
    },
    onError: (err) => {
      if (err.response?.status === 403) {
        toast.error('Admin only — ask an admin to remove duplicates.');
      } else {
        toast.error(err.response?.data?.error || 'Failed');
      }
    },
  });

  // --- Duplicate serials: fix a wrong asset tag instead of deleting ---
  const [tagDrafts, setTagDrafts] = useState({});
  const setAssetTag = useMutation({
    mutationFn: ({ id, asset_tag }) => equipmentApi.setAssetTag(id, asset_tag),
    onSuccess: (_res, variables) => {
      invalidate();
      toast.success('Asset tag updated');
      setTagDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
    onError: (err) => {
      if (err.response?.status === 409) {
        toast.error('That tag is already in use by another unit.');
      } else {
        toast.error(err.response?.data?.error || 'Failed');
      }
    },
  });

  // --- Blank names ---
  const [nameDrafts, setNameDrafts] = useState({});
  const updateName = useMutation({
    mutationFn: ({ id, name }) => equipmentApi.update(id, { name }),
    onSuccess: (_res, variables) => {
      invalidate();
      toast.success('Name saved');
      setNameDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card p-12 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-danger-400" />
        <h3 className="text-lg font-semibold text-dark-700">Failed to load inventory issues</h3>
        <p className="text-dark-500 mt-1">{error?.response?.data?.error || error?.message || 'Please try again'}</p>
      </div>
    );
  }

  const collisions = data?.collisions || [];
  const untagged = data?.untagged || { count: 0, sample: [], truncated: false };
  const blankNames = data?.blank_names || { count: 0, rows: [], truncated: false };
  const duplicateSerials = data?.duplicate_serials || [];
  const missingSerials = data?.missing_serials || { count: 0, truncated: false };

  return (
    <div className="space-y-6 page-animate">
      {/* Header */}
      <div>
        <h1 className="page-title">Inventory Issues</h1>
        <p className="page-subtitle">Data quality problems in the equipment registry</p>
      </div>

      {/* Tag Collisions */}
      <section className="card p-6">
        <SectionHeading icon={Tags} title="Tag Collisions" count={collisions.length} tone="danger" />
        {collisions.length === 0 ? (
          <EmptyNote text="None — no asset tags are shared by multiple units." />
        ) : (
          <div className="space-y-6 mt-4">
            {collisions.map((group) => {
              const selected = selectedByTag[group.asset_tag];
              const isResolving = resolveCollision.isPending && resolveCollision.variables?.tag === group.asset_tag;
              return (
                <div key={group.asset_tag} className="border border-dark-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="font-mono text-sm font-semibold text-primary-600">Tag: {group.asset_tag}</p>
                    <span className="text-xs text-dark-500">{group.units.length} units share this tag</span>
                  </div>
                  <p className="text-xs text-dark-500 mb-3 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    Pick the unit that should keep this tag — the tag will be cleared from the others.
                  </p>
                  <div className="space-y-2">
                    {group.units.map((unit) => (
                      <label
                        key={unit.id}
                        className={clsx(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          selected === unit.id ? 'border-primary-400 bg-primary-50' : 'border-dark-100 hover:bg-dark-50'
                        )}
                      >
                        <input
                          type="radio"
                          name={`collision-${group.asset_tag}`}
                          className="mt-1"
                          checked={selected === unit.id}
                          onChange={() => setSelectedByTag((prev) => ({ ...prev, [group.asset_tag]: unit.id }))}
                          disabled={!canEdit}
                        />
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="font-medium text-dark-900 truncate">{unit.name || 'Unnamed'}</p>
                          <p className="text-dark-500">
                            {unit.model || 'No model'}
                            {unit.serial_number ? ` · S/N ${unit.serial_number}` : ''}
                            {unit.location ? ` · ${unit.location}` : ''}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {canEdit && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="btn btn-primary flex items-center gap-2"
                        disabled={!selected || isResolving}
                        onClick={() => resolveCollision.mutate({ tag: group.asset_tag, keep_id: selected })}
                      >
                        {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Keep this one
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Duplicate Serials */}
      <section className="card p-6">
        <SectionHeading icon={Copy} title="Duplicate Serial Numbers" count={duplicateSerials.length} tone="warning" />
        {duplicateSerials.length === 0 ? (
          <EmptyNote text="None — no serial numbers are duplicated." />
        ) : (
          <div className="space-y-4 mt-4">
            {duplicateSerials.map((group) => (
              <div key={group.serial_number} className="border border-dark-100 rounded-xl p-4">
                <p className="font-mono text-sm font-semibold text-dark-900 mb-3">S/N: {group.serial_number}</p>
                <div className="space-y-2">
                  {group.rows.map((row) => {
                    const tagDraft = tagDrafts[row.id] ?? (row.asset_tag || '');
                    const tagUnchanged = tagDraft.trim() === (row.asset_tag || '').trim();
                    return (
                      <div key={row.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-dark-50 rounded-lg">
                        <div className="min-w-0 text-sm">
                          <p className="font-medium text-dark-900 truncate">{row.name || 'Unnamed'}</p>
                          <p className="text-dark-500 truncate">{row.model || 'No model'}</p>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="text"
                              placeholder="Asset tag"
                              value={tagDraft}
                              onChange={(e) => setTagDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              className="input py-2 w-36"
                            />
                            <button
                              type="button"
                              className="btn btn-secondary flex items-center gap-2"
                              disabled={!tagDraft.trim() || tagUnchanged || setAssetTag.isPending}
                              onClick={() => setAssetTag.mutate({ id: row.id, asset_tag: tagDraft.trim() })}
                              title="Fix a wrong asset tag on this record"
                            >
                              <Tag className="w-4 h-4" />
                              Save Tag
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary text-danger-600 hover:bg-danger-50 flex items-center gap-2"
                              disabled={deleteDuplicate.isPending}
                              onClick={() => {
                                if (confirm(`Delete "${row.name || 'this record'}"? This cannot be undone from here.`)) {
                                  deleteDuplicate.mutate(row.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete this record
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Blank Names */}
      <section className="card p-6">
        <SectionHeading icon={Type} title="Blank Names" count={blankNames.count} tone="warning" />
        {blankNames.count === 0 ? (
          <EmptyNote text="None — every unit has a name." />
        ) : (
          <>
            <div className="space-y-2 mt-4">
              {blankNames.rows.map((row) => {
                const draft = nameDrafts[row.id] ?? '';
                return (
                  <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    <div className="min-w-0 text-sm flex-1">
                      <p className="text-dark-500">
                        {row.model || 'No model'}
                        {row.serial_number ? ` · S/N ${row.serial_number}` : ''}
                        {row.asset_tag ? ` · Tag ${row.asset_tag}` : ''}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Enter a name"
                          value={draft}
                          onChange={(e) => setNameDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          className="input py-2 w-56"
                        />
                        <button
                          type="button"
                          className="btn btn-primary flex items-center gap-2"
                          disabled={!draft.trim() || updateName.isPending}
                          onClick={() => updateName.mutate({ id: row.id, name: draft.trim() })}
                        >
                          <Save className="w-4 h-4" />
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {blankNames.truncated && (
              <p className="text-xs text-dark-400 mt-3">Showing first {blankNames.rows.length} of {blankNames.count}.</p>
            )}
          </>
        )}
      </section>

      {/* Untagged (read-only) */}
      <section className="card p-6">
        <SectionHeading icon={ScanLine} title="Untagged Equipment" count={untagged.count} tone="primary" />
        {untagged.count === 0 ? (
          <EmptyNote text="None — every unit has an asset tag." />
        ) : (
          <>
            <p className="text-sm text-dark-500 mt-4 mb-3 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              Tag these using the{' '}
              <Link to="/equipment/scan" className="text-primary-600 hover:text-primary-700 font-medium">
                Scan page
              </Link>
              .
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {untagged.sample.map((item) => (
                <div key={item.id} className="p-3 bg-dark-50 rounded-lg text-sm">
                  <p className="font-medium text-dark-900 truncate">{item.name || 'Unnamed'}</p>
                  <p className="text-dark-500 truncate">{item.model || 'No model'}</p>
                </div>
              ))}
            </div>
            {untagged.truncated && (
              <p className="text-xs text-dark-400 mt-3">Showing first {untagged.sample.length} of {untagged.count}.</p>
            )}
          </>
        )}
      </section>

      {/* Missing Serials (read-only) */}
      <section className="card p-6">
        <SectionHeading icon={Hash} title="Missing Serial Numbers" count={missingSerials.count} tone="dark" />
        {missingSerials.count === 0 ? (
          <EmptyNote text="None — every unit has a serial number." />
        ) : (
          <p className="text-sm text-dark-500 mt-4">
            {missingSerials.count}{missingSerials.truncated ? '+' : ''} unit{missingSerials.count === 1 ? '' : 's'} missing a serial number.
          </p>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, count, tone = 'primary' }) {
  const toneClasses = {
    danger: 'bg-danger-50 text-danger-600',
    warning: 'bg-warning-50 text-warning-600',
    primary: 'bg-primary-50 text-primary-600',
    dark: 'bg-dark-100 text-dark-600',
  };
  return (
    <div className="flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', toneClasses[tone])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-dark-900">{title}</h2>
        <span className="badge bg-dark-100 text-dark-600 border border-dark-200/50">{count}</span>
      </div>
    </div>
  );
}

function EmptyNote({ text }) {
  return <p className="text-sm text-dark-400 mt-3">{text}</p>;
}

export default InventoryIssues;
