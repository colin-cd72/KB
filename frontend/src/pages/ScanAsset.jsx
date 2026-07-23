import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ScanLine, Camera, Sparkles, Check, X, Search } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import { equipmentApi } from '../services/api';

const FIELDS = [
  ['name', 'Name'],
  ['manufacturer', 'Manufacturer'],
  ['model', 'Model'],
  ['serial_number', 'Serial number'],
  ['location', 'Location'],
  ['description', 'Description'],
];

export default function ScanAsset() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('scan'); // scan | choose | form
  const [tag, setTag] = useState('');
  const [manualTag, setManualTag] = useState('');
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState(null); // 'new' | 'bind'
  const [form, setForm] = useState({});
  const [ai, setAi] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);
  const [bindTarget, setBindTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(null);

  // Look up the scanned tag. 404 means it is unassigned, which is the normal path.
  const lookup = useMutation({
    mutationFn: (t) => equipmentApi.getByAssetTag(t),
    onSuccess: (res) => {
      setFound(res.data.equipment);
      setStage('found');
    },
    onError: (err) => {
      if (err.response?.status === 404) setStage('choose');
      else toast.error(err.response?.data?.error || 'Lookup failed');
    },
  });

  const identify = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('photo', file);
      return equipmentApi.identifyPhoto(fd);
    },
    onSuccess: (res) => {
      const id = res.data.identification;
      setAi(id);
      setPhotoPath(res.data.photo_path || null);
      if (!id.available) {
        toast('AI unavailable — fill the form manually', { icon: '⚠️' });
        return;
      }
      if (id.confidence === 'none' || id.confidence === 'low') {
        toast('Low confidence — review the suggestions before saving', { icon: '⚠️' });
        return; // deliberately do NOT prefill
      }
      setForm((f) => ({
        ...f,
        name: f.name || id.name || '',
        manufacturer: f.manufacturer || id.manufacturer || '',
        model: f.model || id.model || '',
        serial_number: f.serial_number || id.serial_number || '',
      }));
      toast.success(`Identified (${id.confidence} confidence)`);
    },
    onError: () => toast.error('Identification failed — fill the form manually'),
  });

  const create = useMutation({
    mutationFn: (data) => equipmentApi.create(data),
    onSuccess: () => { toast.success('Asset registered'); navigate('/equipment'); },
    onError: (err) => {
      if (err.response?.status === 409) toast.error('That tag is already assigned');
      else toast.error(err.response?.data?.error || 'Save failed');
    },
  });

  const bind = useMutation({
    mutationFn: ({ id, asset_tag }) =>
      equipmentApi.setAssetTag(id, asset_tag, {
        asset_photo_path: photoPath,
        ai_identification: ai,
      }),
    onSuccess: () => { toast.success('Tag bound to asset'); navigate('/equipment'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Bind failed'),
  });

  const candidates = useQuery({
    queryKey: ['equipment-search', search],
    queryFn: () => equipmentApi.getAll({ search, limit: 20 }),
    enabled: mode === 'bind' && search.length >= 2,
  });

  const handleScan = useCallback((text) => {
    setScanning(false);
    setTag(text);
    lookup.mutate(text);
  }, [lookup]);

  const handleScanError = useCallback((msg) => {
    setScanning(false);
    toast.error(msg);
  }, []);

  const submitManual = (e) => {
    e.preventDefault();
    const t = manualTag.trim();
    if (!t) return;
    setTag(t);
    lookup.mutate(t);
  };

  const aiMark = (field) =>
    ai && ai[field] && form[field] === ai[field]
      ? <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent-500"><Sparkles className="h-3 w-3" />AI</span>
      : null;

  const resetAll = () => {
    setStage('scan'); setAi(null); setPhotoPath(null); setForm({});
    setBindTarget(null); setMode(null); setSearch(''); setTag(''); setFound(null);
  };

  return (
    <div className="mx-auto max-w-lg p-4 pb-24">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <ScanLine className="h-5 w-5" /> Scan Asset
      </h1>

      {stage === 'scan' && (
        <div className="space-y-4">
          {scanning ? (
            <>
              <BarcodeScanner onScan={handleScan} onError={handleScanError} />
              <button onClick={() => setScanning(false)}
                className="w-full btn btn-secondary py-3">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setScanning(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-4 btn-primary">
              <Camera className="h-5 w-5" /> Scan barcode
            </button>
          )}

          <form onSubmit={submitManual} className="space-y-2">
            <label className="block text-sm text-gray-600">Or enter the tag by hand</label>
            <div className="flex gap-2">
              <input value={manualTag} onChange={(e) => setManualTag(e.target.value)}
                inputMode="numeric" placeholder="0075"
                className="input flex-1" />
              <button type="submit" disabled={lookup.isPending}
                className="btn btn-primary px-4 disabled:opacity-50">
                {lookup.isPending ? '…' : 'Go'}
              </button>
            </div>
          </form>
        </div>
      )}

      {stage === 'choose' && (
        <div className="space-y-3">
          <p className="rounded-lg bg-warning-500/10 p-3 text-sm text-warning-500">
            Tag <strong>{tag}</strong> is not yet assigned.
          </p>
          <button onClick={() => { setMode('bind'); setStage('form'); }}
            className="w-full rounded-lg py-4 btn-secondary">
            Attach to an existing asset
          </button>
          <button onClick={() => { setMode('new'); setStage('form'); }}
            className="w-full rounded-lg py-4 btn-primary">
            Register a new asset
          </button>
        </div>
      )}

      {stage === 'found' && found && (
        <div className="space-y-3">
          <p className="rounded-lg bg-success-500/10 p-3 text-sm text-success-500">
            Tag <strong>{tag}</strong> is registered.
          </p>
          <dl className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-gray-500">Name</dt><dd>{found.name || '(no name)'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-gray-500">Manufacturer</dt><dd>{found.manufacturer || '—'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-gray-500">Model</dt><dd>{found.model || '—'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-gray-500">Serial</dt>
              <dd className="font-mono">{found.serial_number || '—'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-gray-500">Location</dt><dd>{found.location || '—'}</dd>
            </div>
          </dl>
          <button onClick={resetAll}
            className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-500">
            <X className="h-4 w-4" /> Start over
          </button>
        </div>
      )}

      {stage === 'form' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            Asset tag: <strong>{tag}</strong>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm text-gray-700">
              <Camera className="h-4 w-4" /> Photo of the unit (optional)
            </span>
            <input type="file" accept="image/*" capture="environment"
              onChange={(e) => e.target.files?.[0] && identify.mutate(e.target.files[0])}
              className="block w-full text-sm" />
          </label>

          {identify.isPending && (
            <p className="text-sm text-gray-500">Identifying…</p>
          )}

          {ai && ai.confidence && (
            <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 p-3 text-sm">
              <p className="font-medium text-accent-500">
                AI confidence: {ai.confidence}
              </p>
              {ai.reasoning && <p className="mt-1 text-dark-700">{ai.reasoning}</p>}
              {ai.label_text && (
                <p className="mt-1 font-mono text-xs text-dark-700">{ai.label_text}</p>
              )}
              {ai.serial_number_unverified && (
                <p className="mt-2 rounded bg-warning-100 p-2 text-warning-600">
                  Possible serial <span className="font-mono">{ai.serial_number_unverified}</span> —
                  could not be confirmed against the label. Type it in yourself if it is correct.
                </p>
              )}
              {(ai.confidence === 'low' || ai.confidence === 'none') && (
                <div className="mt-2 rounded bg-accent-100 p-2">
                  <p className="mb-1 text-accent-500">
                    Not pre-filled. Copy anything useful across yourself.
                  </p>
                  {ai.manufacturer && <p>Manufacturer: <span className="font-mono">{ai.manufacturer}</span></p>}
                  {ai.model && <p>Model: <span className="font-mono">{ai.model}</span></p>}
                  {ai.name && <p>Name: <span className="font-mono">{ai.name}</span></p>}
                </div>
              )}
            </div>
          )}

          {mode === 'bind' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Search className="h-4 w-4" /> Find the asset
              </label>
              <input value={search}
                onChange={(e) => { setSearch(e.target.value); setBindTarget(null); }}
                placeholder={ai?.model || 'Search by name or model'}
                className="input w-full" />
              <ul className="max-h-64 divide-y overflow-auto rounded-lg border">
                {(candidates.data?.data?.equipment || []).map((eq) => (
                  <li key={eq.id}>
                    <button onClick={() => setBindTarget(eq)}
                      className={`flex w-full items-center justify-between p-3 text-left ${bindTarget?.id === eq.id ? 'bg-accent-500/10' : ''}`}>
                      <span>
                        <span className="block font-medium">{eq.name || '(no name)'}</span>
                        <span className="block text-xs text-gray-500">
                          {eq.manufacturer} {eq.model}
                        </span>
                      </span>
                      {bindTarget?.id === eq.id && <Check className="h-4 w-4 text-accent-500" />}
                    </button>
                  </li>
                ))}
              </ul>
              {bindTarget && (
                <p className="rounded-lg bg-accent-100 p-3 text-sm text-accent-600">
                  Selected: <strong>{bindTarget.name || '(no name)'}</strong>
                  {bindTarget.model ? ` — ${bindTarget.model}` : ''}
                </p>
              )}
              <button disabled={!bindTarget || bind.isPending}
                onClick={() => bind.mutate({ id: bindTarget.id, asset_tag: tag })}
                className="w-full rounded-lg py-3 btn-primary disabled:opacity-50">
                {bind.isPending ? 'Binding…' : 'Bind tag to this asset'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-sm text-gray-700">
                    {label}{aiMark(key)}
                  </span>
                  <input value={form[key] || ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="input w-full" />
                </label>
              ))}
              <button disabled={!form.name || create.isPending}
                onClick={() => create.mutate({
                  ...form, asset_tag: tag, asset_photo_path: photoPath, ai_identification: ai,
                })}
                className="w-full rounded-lg py-3 btn-primary disabled:opacity-50">
                {create.isPending ? 'Saving…' : 'Save asset'}
              </button>
              {!form.name && (
                <p className="text-center text-xs text-gray-500">Name is required</p>
              )}
            </div>
          )}

          <button onClick={resetAll}
            className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-500">
            <X className="h-4 w-4" /> Start over
          </button>
        </div>
      )}
    </div>
  );
}
