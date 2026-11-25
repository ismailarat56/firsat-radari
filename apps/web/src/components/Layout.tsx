import { useEffect, useRef, useState, type ReactNode } from 'react';
import { categories, type Source, type Summary } from '@shared/contracts';
import { Icon, RadarMark, type IconName } from './Icon';
import type { View } from '../lib/navigation';
import { categoryLabels } from '../lib/format';
import { Modal } from './ui';
import { categoryIcons } from '../features/inbox/OpportunityList';

export const viewLabels: Record<View, string> = {
  overview: 'İnceleme masası',
  inbox: 'Gelen kutusu',
  saved: 'Kaydedilenler',
  calendar: 'Takvim',
  sources: 'Kaynaklar',
  notifications: 'Bildirimler',
  settings: 'Ayarlar',
};
const navigation: { view: View; icon: IconName }[] = [
  { view: 'overview', icon: 'LayoutDashboard' },
  { view: 'inbox', icon: 'Inbox' },
  { view: 'saved', icon: 'Bookmark' },
  { view: 'calendar', icon: 'CalendarDays' },
  { view: 'notifications', icon: 'Bell' },
];
export function Layout({
  view,
  onNavigate,
  summary,
  unreadNotifications,
  demo,
  query,
  onSearch,
  sources,
  sourceId,
  category,
  onSource,
  onCategory,
  actions,
  scanStatus,
  children,
}: {
  view: View;
  onNavigate: (view: View) => void;
  summary?: Summary;
  unreadNotifications: number;
  demo: boolean;
  query: string;
  onSearch: (value: string) => void;
  sources: Source[];
  sourceId: string;
  category: string;
  onSource: (id: string) => void;
  onCategory: (category: string) => void;
  actions: ReactNode;
  scanStatus: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const go = (next: View) => {
    onNavigate(next);
    setMenuOpen(false);
  };
  const menu = () => (
    <>
      <button className="brand" onClick={() => go('overview')} aria-label="Fırsat Radarı ana sayfa">
        <RadarMark className="brand-mark" />
        <span>
          fırsat<strong>radarı</strong>
          <small>KİŞİSEL TAKİP MASASI</small>
        </span>
      </button>
      <div className="sidebar-scroll">
        <div className="nav-label">ÇALIŞMA ALANI</div>
        <nav aria-label="Görünümler">
          {navigation.map(({ view: target, icon }) => (
            <button
              key={target}
              className={`nav-item ${view === target ? 'active' : ''}`}
              aria-current={view === target ? 'page' : undefined}
              onClick={() => go(target)}
            >
              <Icon name={icon} size={17} />
              <span>{viewLabels[target]}</span>
              {target === 'inbox' && !!summary?.unreadCount && (
                <span className="nav-count">{summary.unreadCount}</span>
              )}
              {target === 'saved' && !!summary?.savedCount && (
                <span className="nav-muted-count">{summary.savedCount}</span>
              )}
              {target === 'notifications' && unreadNotifications > 0 && (
                <span className="nav-count" aria-label={`${unreadNotifications} okunmamış`}>
                  {unreadNotifications}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">KATEGORİLER</div>
        <nav aria-label="Kategoriler">
          {categories.map((value) => (
            <button
              key={value}
              className={`nav-item category-nav ${category === value ? 'active' : ''}`}
              aria-pressed={category === value}
              onClick={() => {
                onCategory(category === value ? '' : value);
                setMenuOpen(false);
              }}
            >
              <Icon name={categoryIcons[value]} size={16} />
              <span>{categoryLabels[value]}</span>
            </button>
          ))}
        </nav>
        <div className="nav-label nav-label-action">
          <span>
            KAYNAKLAR <span>{sources.length}</span>
          </span>
          <button
            className="icon-button"
            onClick={() => go('sources')}
            aria-label="Kaynak yönetimini aç"
          >
            <Icon name="Settings2" size={14} />
          </button>
        </div>
        <nav aria-label="Kaynaklara göre gelişmeler">
          <button
            className={`nav-item ${!sourceId && view === 'inbox' ? 'source-active' : ''}`}
            onClick={() => {
              onSource('');
              setMenuOpen(false);
            }}
          >
            <Icon name="Radio" size={16} />
            <span>Tüm kaynaklar</span>
          </button>
          {sources.map((source) => (
            <button
              key={source.id}
              className={`nav-item source-nav ${sourceId === source.id ? 'active' : ''}`}
              aria-pressed={sourceId === source.id}
              onClick={() => {
                onSource(source.id);
                setMenuOpen(false);
              }}
              title={`${source.name} · ${source.lastError ?? (!source.enabled ? 'Duraklatıldı' : source.baselineRequired ? 'Başlangıç onayı bekliyor' : 'Takipte')}`}
            >
              <Icon
                name={
                  !source.enabled
                    ? 'Pause'
                    : source.lastError || source.baselineRequired
                      ? 'AlertCircle'
                      : source.kind === 'rss'
                        ? 'Rss'
                        : 'FileText'
                }
                size={14}
                className={source.lastError || source.baselineRequired ? 'attention' : ''}
              />
              <span>{source.name}</span>
            </button>
          ))}
          {!sources.length && <p className="nav-empty">Eklediğin kaynaklar burada görünür.</p>}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <button
          className={`nav-item ${view === 'sources' ? 'active' : ''}`}
          onClick={() => go('sources')}
          aria-current={view === 'sources' ? 'page' : undefined}
        >
          <Icon name="Radio" size={17} />
          <span>Kaynaklar</span>
        </button>
        <button
          className={`nav-item ${view === 'settings' ? 'active' : ''}`}
          onClick={() => go('settings')}
          aria-current={view === 'settings' ? 'page' : undefined}
        >
          <Icon name="Settings2" size={17} />
          <span>Ayarlar</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setMenuOpen(false);
            setHelpOpen(true);
          }}
        >
          <Icon name="CircleHelp" size={17} />
          <span>Yardım ve kısayollar</span>
        </button>
        <div className="local-profile">
          <span className="profile-avatar">K</span>
          <span>
            Kişisel çalışma alanı
            <small>
              <Icon name="LockKeyhole" size={11} /> Bu bilgisayarda
            </small>
          </span>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        İçeriğe geç
      </a>
      <aside className="sidebar" aria-label="Ana navigasyon">
        {menu()}
      </aside>
      {menuOpen && (
        <Modal
          open
          onOpenChange={setMenuOpen}
          title="Kaynaklar ve görünümler"
          className="navigation-drawer"
          initialFocus=".brand"
        >
          {menu()}
        </Modal>
      )}
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Ana menüyü aç"
            aria-expanded={menuOpen}
          >
            <Icon name="Menu" />
          </button>
          <label className="global-search">
            <Icon name="Search" size={18} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onSearch(event.target.value)}
              aria-label="Fırsatlarda ara"
              placeholder="Başlık, kaynak veya içerikte ara…"
            />
            {query ? (
              <button
                className="icon-button"
                onClick={() => onSearch('')}
                aria-label="Aramayı temizle"
              >
                <Icon name="X" size={15} />
              </button>
            ) : (
              <kbd>⌘ / Ctrl K</kbd>
            )}
          </label>
          <div className="toolbar-status">{scanStatus}</div>
          <div className="page-actions">{actions}</div>
        </header>
        {demo && (
          <div className="demo-banner">
            <Icon name="Eye" size={14} />
            <strong>Örnek çalışma alanı</strong>
            <span>Demo içerikleri · Canlı tarama yapılmıyor</span>
          </div>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            <Icon name="ShieldCheck" size={13} /> Yerel çalışma alanı
          </span>
          <span>İzleme yalnız uygulama açıkken sürer.</span>
        </footer>
      </div>
      <Modal
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Kaynak → gelişme → kanıt"
        description="Fırsat Radarı ile çalışma rehberi"
      >
        <div className="help-steps">
          <div>
            <span>01</span>
            <section>
              <h3>Kaynağını ekle</h3>
              <p>
                Kamuya açık RSS / Atom beslemesini veya belirlediğin statik HTML bölgesini ekle.
                Güvenli önizlemeyi inceleyip başlangıç görüntüsünü onayla.
              </p>
            </section>
          </div>
          <div>
            <span>02</span>
            <section>
              <h3>Değişikliği incele</h3>
              <p>
                Listeden bir gelişme seç. Önceki ve yeni görüntüyü tarihleriyle karşılaştır. Daha
                geniş alan için “Tam genişlikte incele”yi kullan.
              </p>
            </section>
          </div>
          <div>
            <span>03</span>
            <section>
              <h3>Kararını kanıtıyla kaydet</h3>
              <p>
                İnceledim, Kaydet, İlgisiz veya Arşivle ile karar ver. Yalnız onayladığın tarihler
                takvimine eklenir; kaynak tarihi değişirse yeniden incelemen istenir.
              </p>
            </section>
          </div>
        </div>
        <div className="help-foot">
          <p>
            <kbd>Ctrl / ⌘ K</kbd> Aramaya geç (metin yazmıyorken)
          </p>
          <p>
            <kbd>Tab</kbd> İşlemler arasında gezin <kbd>Enter</kbd> Seçili kaydı aç
          </p>
          <p>
            <kbd>Esc</kbd> Paneli kapat ve listeye dön
          </p>
        </div>
        <div className="info-strip">
          <Icon name="Radio" />
          <p>
            En fazla 50 kaynak. Varsayılan kontrol aralığı 6 saat. İzleme yalnız uygulama açıkken
            sürer; internet, kaynak kontrolü için gerekir.
          </p>
        </div>
      </Modal>
    </div>
  );
}
