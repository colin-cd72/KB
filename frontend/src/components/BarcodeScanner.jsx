import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, CameraOff } from 'lucide-react';

/**
 * Live barcode scanner. Prefers the native BarcodeDetector API (Chrome,
 * Android) and falls back to ZXing (Safari, iOS). Multiple symbologies are
 * attempted at once so the roll's exact encoding need not be known.
 */
export default function BarcodeScanner({ onScan, onError }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const firedRef = useRef(false);
  const [status, setStatus] = useState('starting');

  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  // Keep the latest callbacks without making them effect dependencies - the
  // camera must not restart because a parent re-rendered.
  useEffect(() => { onScanRef.current = onScan; onErrorRef.current = onError; });

  useEffect(() => {
    let cancelled = false;

    const fire = (text) => {
      if (firedRef.current || cancelled) return;
      firedRef.current = true;
      // Some scanners prepend an AIM symbology identifier (]C1, ]A0, ...).
      // Strip it so the tag normalizer sees the bare barcode value.
      onScanRef.current(String(text).trim().replace(/^\][A-Za-z]\d/, ''));
    };

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');

        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({
            formats: ['code_39', 'code_128', 'itf', 'ean_13', 'qr_code'],
          });
          const tick = async () => {
            if (cancelled || firedRef.current || !videoRef.current) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found.length > 0) {
                stream.getTracks().forEach((t) => t.stop());
                return fire(found[0].rawValue);
              }
            } catch {
              // transient decode failure; keep polling
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        } else {
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromStream(
            stream,
            videoRef.current,
            (result) => { if (result) fire(result.getText()); }
          );
          if (cancelled) {
            // Unmounted while decodeFromStream was pending - cleanup has already
            // run and could not have seen these controls.
            try { controls.stop(); } catch { /* already stopped */ }
            return;
          }
          controlsRef.current = controls;
        }
      } catch (err) {
        setStatus('denied');
        onErrorRef.current(
          err && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Enter the tag by hand.'
            : 'Camera unavailable. Enter the tag by hand.'
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* already stopped */ }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        className="h-64 w-full object-cover"
        playsInline
        muted
        aria-label="Barcode scanner camera preview"
      />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70" />
      <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2 text-xs text-white">
        {status === 'denied' ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        <span>
          {status === 'starting' && 'Starting camera…'}
          {status === 'scanning' && 'Point at the barcode'}
          {status === 'denied' && 'Camera unavailable'}
        </span>
      </div>
    </div>
  );
}
