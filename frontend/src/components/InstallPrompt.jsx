import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import clsx from 'clsx';

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed or in standalone mode
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.includes('android-app://');
    setIsStandalone(isInStandaloneMode);

    // Check for iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIOSDevice);

    // Check if user has dismissed the prompt recently
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed = (now - dismissedDate) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return; // Don't show for 7 days after dismissal
      }
    }

    // Listen for beforeinstallprompt event (Android/Desktop)
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a delay to not interrupt initial experience
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show prompt after delay if not in standalone
    if (isIOSDevice && !isInStandaloneMode) {
      setTimeout(() => setShowPrompt(true), 5000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowPrompt(false);
      }
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', new Date().toISOString());
  };

  // Don't show if already installed
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-white rounded-xl shadow-2xl border border-dark-100 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-dark-900">Install KB App</h3>
              <p className="text-sm text-dark-500 mt-1">
                {isIOS
                  ? 'Tap the share button and "Add to Home Screen" for quick access'
                  : 'Install for quick access and offline support'}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 text-dark-400 hover:text-dark-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isIOS && deferredPrompt && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleDismiss}
                className="flex-1 btn btn-secondary text-sm"
              >
                Not now
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 btn btn-primary text-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Install
              </button>
            </div>
          )}

          {isIOS && (
            <div className="mt-4 p-3 bg-dark-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-dark-600">
                <span className="font-medium">Steps:</span>
                <span>Tap</span>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L12 14M12 2L8 6M12 2L16 6" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M4 14V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V14" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>then "Add to Home Screen"</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstallPrompt;
