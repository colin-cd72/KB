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

  // Look up the scanned tag. 404 means it is unassigned, which is the normal path.
  const lookup = useMutation({
    mutationFn: (t) => equipmentApi.getByAssetTag(t),
    onSuccess: (res) => {
      toast.success('Tag already registered');
      navigate(`/equipment?highlight=${res.data.equipment.id}`);
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
      ? <span className="ml-2 inline-flex items-center gap-1 text-xs text-purple-600"><Sparkles className="h-3 w-3" />AI</span>
      : null;

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
                className="w-full rounded-lg border border-gray-300 py-3 text-gray-700">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setScanning(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-4 text-white">
              <Camera className="h-5 w-5" /> Scan barcode
            </button>
          )}

          <form onSubmit={submitManual} className="space-y-2">
            <label className="block text-sm text-gray-600">Or enter the tag by hand</label>
            <div className="flex gap-2">
              <input value={manualTag} onChange={(e) => setManualTag(e.target.value)}
                inputMode="numeric" placeholder="0075"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-3" />
              <button type="submit" disabled={lookup.isPending}
                className="rounded-lg bg-gray-800 px-4 text-white disabled:opacity-50">
                {lookup.isPending ? '…' : 'Go'}
              </button>
            </div>
          </form>
        </div>
      )}

      {stage === 'choose' && (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Tag <strong>{tag}</strong> is not yet assigned.
          </p>
          <button onClick={() => { setMode('bind'); setStage('form'); }}
            className="w-full rounded-lg border-2 border-indigo-600 py-4 text-indigo-700">
            Attach to an existing asset
          </button>
          <button onClick={() => { setMode('new'); setStage('form'); }}
            className="w-full rounded-lg bg-indigo-600 py-4 text-white">
            Register a new asset
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
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
              <p className="font-medium text-purple-900">
                AI confidence: {ai.confidence}
              </p>
              {ai.reasoning && <p className="mt-1 text-purple-800">{ai.reasoning}</p>}
              {ai.label_text && (
                <p className="mt-1 font-mono text-xs text-purple-700">{ai.label_text}</p>
              )}
              {ai.serial_number_unverified && (
                <p className="mt-2 rounded bg-amber-100 p-2 text-amber-900">
                  Possible serial <span className="font-mono">{ai.serial_number_unverified}</span> —
                  could not be confirmed against the label. Type it in yourself if it is correct.
                </p>
              )}
              {(ai.confidence === 'low' || ai.confidence === 'none') && (
                <p className="mt-2 text-purple-900">
                  Not pre-filled. Copy anything useful across yourself.
                </p>
              )}
            </div>
          )}

          {mode === 'bind' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Search className="h-4 w-4" /> Find the asset
              </label>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={ai?.model || 'Search by name or model'}
                className="w-full rounded-lg border border-gray-300 px-3 py-3" />
              <ul className="max-h-64 divide-y overflow-auto rounded-lg border">
                {(candidates.data?.data?.equipment || []).map((eq) => (
                  <li key={eq.id}>
                    <button onClick={() => setBindTarget(eq)}
                      className={`flex w-full items-center justify-between p-3 text-left ${bindTarget?.id === eq.id ? 'bg-indigo-50' : ''}`}>
                      <span>
                        <span className="block font-medium">{eq.name || '(no name)'}</span>
                        <span className="block text-xs text-gray-500">
                          {eq.manufacturer} {eq.model}
                        </span>
                      </span>
                      {bindTarget?.id === eq.id && <Check className="h-4 w-4 text-indigo-600" />}
                    </button>
                  </li>
                ))}
              </ul>
              <button disabled={!bindTarget || bind.isPending}
                onClick={() => bind.mutate({ id: bindTarget.id, asset_tag: tag })}
                className="w-full rounded-lg bg-indigo-600 py-3 text-white disabled:opacity-50">
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-3" />
                </label>
              ))}
              <button disabled={!form.name || create.isPending}
                onClick={() => create.mutate({
                  ...form, asset_tag: tag, asset_photo_path: photoPath, ai_identification: ai,
                })}
                className="w-full rounded-lg bg-indigo-600 py-3 text-white disabled:opacity-50">
                {create.isPending ? 'Saving…' : 'Save asset'}
              </button>
              {!form.name && (
                <p className="text-center text-xs text-gray-500">Name is required</p>
              )}
            </div>
          )}

          <button onClick={() => {
              setStage('scan'); setAi(null); setPhotoPath(null); setForm({}); setBindTarget(null);
            }}
            className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-500">
            <X className="h-4 w-4" /> Start over
          </button>
        </div>
      )}
    </div>
  );
}
