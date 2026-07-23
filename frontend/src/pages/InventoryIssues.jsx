import { useState, useRef, useMemo, useEffect } from 'react';
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
  ScanLine,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 25;

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

  // Anchors for the triage tiles to scroll to.
  const collisionsRef = useRef(null);
  const duplicatesRef = useRef(null);
  const blankNamesRef = useRef(null);
  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // --- Tag collisions ---
  const [selectedByTag, setSelectedByTag] = useState({});
  // Baseline captured once so we can show progress toward zero.
  const collisionBaseline = useRef(null);

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
        toast.error(err.response?.data?.error || 'Something went wrong');
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
        toast.error(err.response?.data?.error || 'Something went wrong');
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
        toast.error(err.response?.data?.error || 'Something went wrong');
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
      toast.error(err.response?.data?.error || 'Something went wrong');
    },
  });

  // --- Blank-names filter + pagination (client-side over the returned page) ---
  const [nameFilter, setNameFilter] = useState('');
  const [namePage, setNamePage] = useState(0);

  const collisions = data?.collisions || [];
  const untagged = data?.untagged || { count: 0, sample: [], truncated: false };
  const blankNames = data?.blank_names || { count: 0, rows: [], truncated: false };
  const duplicateSerials = data?.duplicate_serials || [];
  const missingSerials = data?.missing_serials || { count: 0, truncated: false };

  // Capture the collision baseline the first time real data arrives.
  useEffect(() => {
    if (data && collisionBaseline.current === null) {
      collisionBaseline.current = collisions.length;
    }
  }, [data, collisions.length]);

  const filteredNames = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return blankNames.rows;
    return blankNames.rows.filter((r) =>
      [r.model, r.serial_number, r.asset_tag].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [blankNames.rows, nameFilter]);

  const namePageCount = Math.max(1, Math.ceil(filteredNames.length / PAGE_SIZE));
  const clampedNamePage = Math.min(namePage, namePageCount - 1);
  const pagedNames = filteredNames.slice(clampedNamePage * PAGE_SIZE, clampedNamePage * PAGE_SIZE + PAGE_SIZE);

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
        <h3 className="text-lg font-semibold text-dark-700">Couldn’t load inventory issues</h3>
        <p className="text-dark-500 mt-1">{error?.response?.data?.error || error?.message || 'Please try again'}</p>
      </div>
    );
  }

  const baseline = collisionBaseline.current ?? collisions.length;
  const collisionsResolved = Math.max(0, baseline - collisions.length);
  const totalOpen = collisions.length + duplicateSerials.length + blankNames.count;

  return (
    <div className="space-y-6 page-animate">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Issues</h1>
          <p className="page-subtitle">
            {totalOpen === 0
              ? 'Everything actionable is clean. Nice.'
              : `${totalOpen} item${totalOpen === 1 ? '' : 's'} to work through in the equipment registry`}
          </p>
        </div>
      </div>

      {/* Triage tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <TriageTile
          icon={Tags}
          tone="danger"
          value={collisions.length}
          label="Tag collisions"
          verb={collisions.length ? 'Resolve first' : 'All clear'}
          onClick={collisions.length ? () => scrollTo(collisionsRef) : undefined}
          progress={baseline > 0 ? { done: collisionsResolved, total: baseline } : null}
          note={collisions.length ? 'Blocks duplicate-tag protection' : 'Protection can be enabled'}
        />
        <TriageTile
          icon={Copy}
          tone="warning"
          value={duplicateSerials.length}
          label="Duplicate serials"
          verb={duplicateSerials.length ? 'Decide' : 'None'}
          onClick={duplicateSerials.length ? () => scrollTo(duplicatesRef) : undefined}
        />
        <TriageTile
          icon={Type}
          tone="accent"
          value={blankNames.count}
          label="Blank names"
          verb={blankNames.count ? 'Fill in' : 'None'}
          onClick={blankNames.count ? () => scrollTo(blankNamesRef) : undefined}
        />
        <TriageTile
          icon={ScanLine}
          tone="primary"
          value={untagged.count}
          label="Untagged"
          verb={untagged.count ? 'Scan to tag' : 'None'}
          to={untagged.count ? '/equipment/scan' : undefined}
        />
        <TriageTile
          icon={Hash}
          tone="muted"
          value={missingSerials.count}
          suffix={missingSerials.truncated ? '+' : ''}
          label="Missing serials"
          verb="Reference"
        />
      </div>

      {/* Needs a decision */}
      {(collisions.length > 0 || duplicateSerials.length > 0) && (
        <GroupLabel text="Needs a decision" hint="Small, bounded fixes — best done in one sitting" />
      )}

      {/* Tag collisions */}
      <section ref={collisionsRef} className="card p-6 scroll-mt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <SectionHeading icon={Tags} title="Tag Collisions" count={collisions.length} tone="danger" />
          {baseline > 0 && (
            <div className="min-w-[180px] flex-1 max-w-xs">
              <div className="flex items-center justify-between text-xs text-dark-500 mb-1">
                <span>{collisionsResolved} of {baseline} resolved</span>
                <span>{collisions.length} left</span>
              </div>
              <div className="h-1.5 rounded-full bg-dark-100 overflow-hidden">
                <div
                  className="h-full bg-danger-500 transition-all duration-500"
                  style={{ width: `${baseline ? (collisionsResolved / baseline) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {collisions.length === 0 ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-success-50 p-4">
            <ShieldCheck className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-success-800">No tag collisions.</p>
              <p className="text-success-700 mt-0.5">Every asset tag is unique. Duplicate-tag protection can now be locked in at the database level.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-5">
            {collisions.map((group) => {
              const selected = selectedByTag[group.asset_tag];
              const isResolving = resolveCollision.isPending && resolveCollision.variables?.tag === group.asset_tag;
              return (
                <div key={group.asset_tag} className="border border-dark-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <span className="badge badge-critical font-mono">Tag {group.asset_tag}</span>
                    <span className="text-xs text-dark-500">{group.units.length} units claim it</span>
                  </div>
                  <p className="text-xs text-dark-500 mb-3 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    Choose the unit that actually wears this tag. The others have it cleared.
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

      {/* Duplicate serials */}
      {duplicateSerials.length > 0 && (
        <section ref={duplicatesRef} className="card p-6 scroll-mt-6">
          <SectionHeading icon={Copy} title="Duplicate Serial Numbers" count={duplicateSerials.length} tone="warning" />
          <div className="space-y-4 mt-5">
            {duplicateSerials.map((group) => {
              const sameModel = group.rows.length > 1 && group.rows.every((r) => (r.model || '') === (group.rows[0].model || ''));
              return (
                <div key={group.serial_number} className="border border-dark-100 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <span className="badge badge-medium font-mono">S/N {group.serial_number}</span>
                    <span className="text-xs text-dark-500">{group.rows.length} records</span>
                  </div>
                  <p className="text-xs text-dark-500 mb-3">
                    {sameModel
                      ? 'Same model and serial — almost certainly one duplicate record. Remove the extra.'
                      : 'Different models share a serial — likely a wrong tag or a mistyped serial. Fix the tag, or remove the wrong record.'}
                  </p>
                  <div className="space-y-2">
                    {group.rows.map((row) => {
                      const tagDraft = tagDrafts[row.id] ?? (row.asset_tag || '');
                      const tagUnchanged = tagDraft.trim() === (row.asset_tag || '').trim();
                      return (
                        <div key={row.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-dark-50 rounded-lg">
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-dark-900 truncate">{row.name || 'Unnamed'}</p>
                            <p className="text-dark-500 truncate">
                              {row.model || 'No model'}{row.asset_tag ? ` · Tag ${row.asset_tag}` : ' · no tag'}
                            </p>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="text"
                                placeholder="Asset tag"
                                value={tagDraft}
                                onChange={(e) => setTagDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                className="input py-2 w-32"
                              />
                              <button
                                type="button"
                                className="btn btn-secondary flex items-center gap-2"
                                disabled={!tagDraft.trim() || tagUnchanged || setAssetTag.isPending}
                                onClick={() => setAssetTag.mutate({ id: row.id, asset_tag: tagDraft.trim() })}
                                title="Correct the asset tag on this record"
                              >
                                <Tag className="w-4 h-4" />
                                Save tag
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger flex items-center gap-2"
                                disabled={deleteDuplicate.isPending}
                                onClick={() => {
                                  if (confirm(`Remove "${row.name || 'this record'}"? It’s hidden from the registry, not permanently deleted.`)) {
                                    deleteDuplicate.mutate(row.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Bulk cleanup */}
      {blankNames.count > 0 && (
        <>
          <GroupLabel text="Bulk cleanup" hint="Chip away at these over time" />
          <section ref={blankNamesRef} className="card p-6 scroll-mt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <SectionHeading icon={Type} title="Blank Names" count={blankNames.count} tone="accent" />
              <div className="relative">
                <Search className="w-4 h-4 text-dark-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by model, serial, or tag"
                  value={nameFilter}
                  onChange={(e) => { setNameFilter(e.target.value); setNamePage(0); }}
                  className="input py-2 pl-9 w-64"
                />
              </div>
            </div>

            <div className="space-y-2 mt-5">
              {pagedNames.length === 0 ? (
                <EmptyNote text="No rows match that filter." />
              ) : pagedNames.map((row) => {
                const draft = nameDrafts[row.id] ?? '';
                return (
                  <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-dark-50 rounded-lg">
                    <div className="min-w-0 text-sm flex-1">
                      <p className="text-dark-600">
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && draft.trim() && !updateName.isPending) {
                              updateName.mutate({ id: row.id, name: draft.trim() });
                            }
                          }}
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

            {/* Pager */}
            <div className="flex items-center justify-between mt-4 text-sm text-dark-500">
              <span>
                {filteredNames.length === 0
                  ? '0 shown'
                  : `${clampedNamePage * PAGE_SIZE + 1}–${clampedNamePage * PAGE_SIZE + pagedNames.length} of ${filteredNames.length}`}
                {nameFilter ? ` filtered` : ''}
                {blankNames.truncated ? ` · ${blankNames.count} total, first ${blankNames.rows.length} loaded` : ''}
              </span>
              {namePageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn-icon"
                    disabled={clampedNamePage === 0}
                    onClick={() => setNamePage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2">{clampedNamePage + 1} / {namePageCount}</span>
                  <button
                    type="button"
                    className="btn-icon"
                    disabled={clampedNamePage >= namePageCount - 1}
                    onClick={() => setNamePage((p) => Math.min(namePageCount - 1, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TriageTile({ icon: Icon, tone, value, suffix = '', label, verb, note, onClick, to, progress }) {
  const toneRing = {
    danger: 'text-danger-600 bg-danger-50',
    warning: 'text-warning-600 bg-warning-50',
    accent: 'text-accent-600 bg-accent-50',
    primary: 'text-primary-600 bg-primary-50',
    muted: 'text-dark-500 bg-dark-100',
  }[tone];

  const interactive = Boolean(onClick || to);
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', toneRing)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-2xl font-bold text-dark-900 tabular-nums">{value}{suffix}</span>
      </div>
      <p className="mt-3 text-sm font-medium text-dark-800">{label}</p>
      <p className={clsx('text-xs mt-0.5', value ? 'text-dark-500' : 'text-dark-400')}>{verb}</p>
      {progress && progress.total > 0 && (
        <div className="mt-2 h-1 rounded-full bg-dark-100 overflow-hidden">
          <div className="h-full bg-danger-500 transition-all duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      {note && <p className="text-[11px] mt-2 text-dark-400 leading-tight">{note}</p>}
    </>
  );

  const base = clsx(
    'card p-4 text-left block',
    interactive && 'card-hover cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-300'
  );

  if (to) return <Link to={to} className={base}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={clsx(base, 'w-full')}>{inner}</button>;
  return <div className={base}>{inner}</div>;
}

function GroupLabel({ text, hint }) {
  return (
    <div className="flex items-baseline gap-3 pt-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-dark-500">{text}</h2>
      {hint && <span className="text-xs text-dark-400">{hint}</span>}
    </div>
  );
}

function SectionHeading({ icon: Icon, title, count, tone = 'primary' }) {
  const toneClasses = {
    danger: 'bg-danger-50 text-danger-600',
    warning: 'bg-warning-50 text-warning-600',
    accent: 'bg-accent-50 text-accent-600',
    primary: 'bg-primary-50 text-primary-600',
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
