import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { LanguageSelector } from '../components/LanguageSelector';
import { MobileInstallBanner } from '../components/MobileInstallBanner';
import { Leaf, ArrowLeft } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useMobileApp } from '../hooks/useMobileApp';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationDictionary } from '../i18n/types';

function getMobilePageTitle(pathname: string, t: TranslationDictionary): string {
  if (pathname.startsWith('/ask')) return t.navAsk;
  if (pathname.startsWith('/library')) return t.navLibrary;
  if (pathname.startsWith('/sensors')) return t.navSensors;
  if (pathname.startsWith('/about')) return t.navAbout;
  if (pathname.startsWith('/evidence')) return 'Evidence Detail';
  if (pathname.startsWith('/privacy')) return 'Privacy';
  if (pathname.startsWith('/terms')) return 'Terms';
  if (pathname.startsWith('/storage')) return 'Cookies & Storage';
  return 'Plant Doctor';
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { isInstalled, isNative } = useMobileApp();
  const { t } = useTranslation();
  const [showInstallModal, setShowInstallModal] = useState(false);

  const isHome = location.pathname === '/' || location.pathname === '';
  const pageTitle = getMobilePageTitle(location.pathname, t);

  return (
    <div className="flex min-h-screen">
      <NavBar showInstallModal={showInstallModal} setShowInstallModal={setShowInstallModal} />
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile top app bar with branding/back button, page title, and compact language selector */}
        <header
          data-testid="mobile-top-bar"
          className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 bg-card/95 backdrop-blur-md border-b border-border shadow-xs pt-[max(0.6rem,env(safe-area-inset-top,0px))]"
        >
          {isHome ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
                <Leaf size={16} aria-hidden="true" />
              </div>
              <span className="font-heading text-base font-bold text-foreground">Plant Doctor</span>
              {isInstalled && (
                <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-primary/15 text-primary">
                  {isNative ? 'APP' : 'PWA'}
                </span>
              )}
              <span
                className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-600 animate-pulse' : 'bg-amber-600'}`}
                title={isOnline ? t.networkOnline : t.offlineMode}
                aria-label={isOnline ? t.networkOnline : t.offlineMode}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Back"
                className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted text-foreground active:scale-95 transition-transform cursor-pointer -ml-1"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <div className="flex items-center gap-2">
                <span className="font-heading text-base font-bold text-foreground truncate max-w-[170px] sm:max-w-[260px]">
                  {pageTitle}
                </span>
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-600' : 'bg-amber-600'}`}
                  title={isOnline ? t.networkOnline : t.offlineMode}
                  aria-label={isOnline ? t.networkOnline : t.offlineMode}
                />
              </div>
            </div>
          )}
          <LanguageSelector variant="compact" />
        </header>

        <ConnectionBanner />
        <MobileInstallBanner onOpenInstallGuide={() => setShowInstallModal(true)} />

        <main className="flex-1 px-4 md:px-8 py-5 max-w-4xl w-full mx-auto">
          <Outlet />
        </main>
        <footer className="px-4 md:px-8 py-6 pb-28 md:pb-6 border-t border-border text-xs text-muted-foreground">
          <nav aria-label="Legal and information" className="flex flex-wrap gap-x-4 gap-y-2 max-w-4xl mx-auto">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/sensors" className="hover:text-foreground transition-colors">Field Sensors</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/storage" className="hover:text-foreground transition-colors">Cookies &amp; Storage</Link>
            <span className="ml-auto">Decision support — not a guaranteed diagnosis.</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}
