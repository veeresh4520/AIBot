import { useState, useEffect } from 'react';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useMobileApp } from '../hooks/useMobileApp';

interface MobileInstallBannerProps {
  onOpenInstallGuide: () => void;
}

export function MobileInstallBanner({ onOpenInstallGuide }: MobileInstallBannerProps) {
  const { t } = useTranslation();
  const { isInstalled, isMobile, canInstall, promptInstall } = useMobileApp();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem('plantdoc_mobile_banner_dismissed') === 'true';
      setDismissed(isDismissed);
    } catch {
      setDismissed(false);
    }
  }, []);

  // Do not show if already downloaded/installed, not a mobile screen, or dismissed
  if (isInstalled || !isMobile || dismissed) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem('plantdoc_mobile_banner_dismissed', 'true');
    } catch {
      // ignore storage error
    }
  }

  async function handleInstallAction() {
    if (canInstall) {
      const installed = await promptInstall();
      if (installed) {
        setDismissed(true);
        return;
      }
    }
    onOpenInstallGuide();
  }

  return (
    <aside
      aria-label="Download mobile application"
      className="md:hidden mx-4 mt-3 mb-1 p-3.5 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border border-primary/20 shadow-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-on-primary shadow-xs">
          <Smartphone size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground flex items-center gap-1 leading-tight">
            <span>Plant Doctor App</span>
            <Sparkles size={12} className="text-primary fill-primary shrink-0" aria-hidden="true" />
          </p>
          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
            Download for instant offline field access
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleInstallAction}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-dark active:scale-95 transition-all shadow-xs cursor-pointer"
        >
          <Download size={13} aria-hidden="true" />
          <span>{t.installApp}</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss download banner"
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95 transition-all cursor-pointer"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
