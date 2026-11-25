import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Settings as SettingsType } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { Badge, EmptyState, ErrorState, Loading, Modal, useToast } from '../../components/ui';
import { api, patch, post, queryClient, refreshData, setSessionToken } from '../../lib/api';
import { useDateFormat } from '../../lib/date-context';

type Backup = { id: string; createdAt: string; fileName: string; sizeBytes: number };
export function Settings({ settings }: { settings: SettingsType }) {
  const { formatDate } = useDateFormat();
  const [timezone, setTimezone] = useState(settings.timezone);
  const [interval, setInterval] = useState(settings.defaultIntervalMinutes);
  const [restoreBackup, setRestoreBackup] = useState<Backup | null>(null);
  const toast = useToast();
  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: () => api<{ backups: Backup[] }>('/backups'),
  });
  const save = useMutation({
    mutationFn: () => patch('/settings', { timezone, defaultIntervalMinutes: interval }),
    onSuccess: async () => {
      await refreshData();
      toast('Çalışma alanı ayarların kaydedildi.');
    },
  });
  const backup = useMutation({
    mutationFn: () => post<{ id: string; createdAt: string; fileName: string }>('/backups'),
    onSuccess: async () => {
      await refreshData();
      toast('Tutarlı veritabanı yedeği oluşturuldu.');
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });
  const logout = useMutation({
    mutationFn: () => post('/logout'),
    onSuccess: () => {
      setSessionToken({ authenticated: false, demo: false });
      queryClient.clear();
      window.location.assign(window.location.pathname);
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });
  const usedMb = settings.evidenceUsedBytes / 1024 / 1024;
  const changed = timezone !== settings.timezone || interval !== settings.defaultIntervalMinutes;
  return (
    <div className="settings-layout">
      <div className="settings-primary">
        <section className="panel settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">
              <Icon name="SlidersHorizontal" size={21} />
            </span>
            <div>
              <h2>Çalışma tercihlerin</h2>
              <p>Radarın, senin ritminde çalışsın.</p>
            </div>
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="settings-field-row">
              <div>
                <label htmlFor="timezone">Saat dilimi</label>
                <p>Olaylar seçtiğin saat diliminde gösterilir.</p>
              </div>
              <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {[
                  'Europe/Istanbul',
                  'Europe/London',
                  'Europe/Berlin',
                  'America/New_York',
                  'Asia/Dubai',
                  'UTC',
                ].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
            <div className="settings-field-row">
              <div>
                <label htmlFor="default-interval">Varsayılan kontrol aralığı</label>
                <p>Yeni ekleyeceğin kaynaklar için kullanılır.</p>
              </div>
              <select
                id="default-interval"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
              >
                <option value={30}>30 dakika</option>
                <option value={60}>1 saat</option>
                <option value={360}>6 saat · Önerilen</option>
                <option value={720}>12 saat</option>
                <option value={1440}>24 saat</option>
              </select>
            </div>
            {save.error && <ErrorState error={save.error} />}
            <div className="settings-save">
              <span>{changed ? 'Kaydedilmemiş değişikliklerin var.' : 'Tercihlerin güncel.'}</span>
              <button
                className="button primary small"
                type="submit"
                disabled={!changed || save.isPending}
              >
                <Icon
                  name={save.isPending ? 'LoaderCircle' : 'Check'}
                  size={15}
                  className={save.isPending ? 'spin' : ''}
                />
                Değişiklikleri kaydet
              </button>
            </div>
          </form>
        </section>
        <section className="panel settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">
              <Icon name="Database" size={21} />
            </span>
            <div>
              <h2>Kanıt ve saklama</h2>
              <p>Her kararın geriye dönüp bakabileceğin bir kaydı var.</p>
            </div>
          </div>
          <div className="retention-grid">
            <div>
              <strong>{settings.maxSnapshots}</strong>
              <span>Görüntü / kaynak</span>
            </div>
            <div>
              <strong>
                {settings.retentionDays}
                <small> gün</small>
              </strong>
              <span>En uzun saklama süresi</span>
            </div>
            <div>
              <strong>
                {settings.evidenceQuotaMb}
                <small> MB</small>
              </strong>
              <span>Ayrı karar kanıtı kotası</span>
            </div>
          </div>
          <div className="storage-usage">
            <div>
              <span>Korunan karar kanıtları</span>
              <strong>
                {usedMb < 0.1
                  ? '< 0,1'
                  : usedMb.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}{' '}
                / {settings.evidenceQuotaMb} MB
              </strong>
            </div>
            <div className="storage-progress">
              <span
                style={{
                  width: `${Math.min(100, Math.max(1, (usedMb / settings.evidenceQuotaMb) * 100))}%`,
                }}
              />
            </div>
            <p>
              Görüntü veya gün sınırından önce dolanı uygulanır. Kararlarına bağlı kanıtlar ayrı
              kotada korunur; sessizce silinmez.
            </p>
          </div>
        </section>
        <section className="panel settings-section">
          <div className="settings-section-header">
            <span className="settings-icon">
              <Icon name="HardDrive" size={21} />
            </span>
            <div>
              <h2>Yedekleme ve geri yükleme</h2>
              <p>Kaynakların, kararların ve kanıtların birlikte korunur.</p>
            </div>
            <button
              className="button secondary small"
              onClick={() => backup.mutate()}
              disabled={backup.isPending}
            >
              <Icon
                name={backup.isPending ? 'LoaderCircle' : 'Plus'}
                size={15}
                className={backup.isPending ? 'spin' : ''}
              />
              Yedek oluştur
            </button>
          </div>
          {backups.isPending ? (
            <Loading label="Yedekler yükleniyor…" />
          ) : backups.error ? (
            <ErrorState error={backups.error} onRetry={() => void backups.refetch()} />
          ) : !backups.data.backups.length ? (
            <EmptyState
              icon="HardDrive"
              title="İlk yedeğini oluştur"
              description="Uygulama çalışırken tutarlı bir SQLite yedeği güvenle alınır."
            />
          ) : (
            <div className="backups-list">
              {backups.data.backups.map((b) => (
                <div className="backup-row" key={b.id}>
                  <Icon name="Database" size={19} />
                  <div>
                    <strong>
                      {formatDate(b.createdAt, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                    <small>
                      {(b.sizeBytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}{' '}
                      KB · SQLite yedeği
                    </small>
                  </div>
                  <a
                    className="icon-button"
                    href={`/api/backups/${encodeURIComponent(b.id)}/download`}
                    download
                    aria-label={`${formatDate(b.createdAt)} yedeğini indir`}
                  >
                    <Icon name="Download" size={17} />
                  </a>
                  <button className="text-button" onClick={() => setRestoreBackup(b)}>
                    Geri yükle
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="settings-note">
            <Icon name="ShieldCheck" size={15} />
            <p>
              Geri yüklemeden önce dosya bütünlüğü doğrulanır ve mevcut verinin otomatik yedeği
              alınır.
            </p>
          </div>
        </section>
      </div>
      <aside className="settings-aside">
        <section className="panel local-data-card">
          <span className="local-data-icon">
            <Icon name="ShieldCheck" size={28} />
          </span>
          <Badge tone="green" dot>
            Yerel çalışma alanı
          </Badge>
          <h2>Verin, senin kontrolünde.</h2>
          <p>
            Kaynakların ve kararların bu bilgisayarda saklanır. Uzak analiz servisi ve zorunlu bulut
            hesabı yoktur.
          </p>
          <dl>
            <dt>Çalışma modu</dt>
            <dd>{settings.demo ? 'Örnek veri deneyimi' : 'Kişisel çalışma alanı'}</dd>
            <dt>Veri dizini</dt>
            <dd className="data-path">{settings.dataDirectory}</dd>
            <dt>Son yedek</dt>
            <dd>
              {settings.lastBackupAt ? formatDate(settings.lastBackupAt) : 'Henüz oluşturulmadı'}
            </dd>
          </dl>
          <p className="encryption-note">
            SQLite dosyası kendiliğinden şifreli değildir. Cihaz erişimini ve yedeklerini koru.
          </p>
        </section>
        <div className="settings-boundaries">
          <Icon name="Radio" size={19} />
          <h3>Radar ne zaman çalışır?</h3>
          <p>
            Yalnızca uygulama açıkken. Bilgisayar kapalı veya uykudayken izleme devam etmez. Aradaki
            gözlem boşluğu ayrıca gösterilir.
          </p>
        </div>
        {!settings.demo && (
          <button
            className="button secondary full"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <Icon name="LogOut" size={16} />
            Güvenli çıkış yap
          </button>
        )}
      </aside>
      {restoreBackup && (
        <RestoreDialog backup={restoreBackup} onClose={() => setRestoreBackup(null)} />
      )}
    </div>
  );
}
function RestoreDialog({ backup, onClose }: { backup: Backup; onClose: () => void }) {
  const { formatDate } = useDateFormat();
  const [confirmation, setConfirmation] = useState('');
  const preview = useQuery({
    queryKey: ['restore-preview', backup.id],
    queryFn: () =>
      post<{ backupId: string; sourceCount: number; itemCount: number; createdAt: string }>(
        '/restore/preview',
        { backupId: backup.id },
      ),
    retry: false,
  });
  const toast = useToast();
  const restore = useMutation({
    mutationFn: () => post('/restore', { backupId: backup.id, confirmation }),
    onSuccess: () => {
      toast('Yedek doğrulandı ve geri yüklendi. Yeniden eşleştirme gerekiyor.');
      queryClient.clear();
      window.location.reload();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !restore.isPending) onClose();
      }}
      title="Bu yedeği geri yükle"
      description="Geri yükleme mevcut çalışma alanının içeriğini değiştirir."
    >
      <div className="restore-content">
        {preview.isPending ? (
          <Loading label="Yedek bütünlüğü doğrulanıyor…" />
        ) : preview.error ? (
          <ErrorState error={preview.error} />
        ) : (
          <>
            <div className="restore-stats">
              <span>
                <strong>{preview.data.sourceCount}</strong> kaynak
              </span>
              <span>
                <strong>{preview.data.itemCount}</strong> fırsat
              </span>
            </div>
            <p>
              {formatDate(backup.createdAt, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              tarihli çalışma alanı geri yüklenecek. Mevcut veriler önce otomatik yedeklenecek.
              Oturumlar kapatılacak.
            </p>
            <div className="field">
              <label htmlFor="restore-confirm">Onaylamak için GERİ YÜKLE yaz</label>
              <input
                id="restore-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </div>
            {restore.error && <ErrorState error={restore.error} />}
            <div className="dialog-actions">
              <button className="button secondary" onClick={onClose} disabled={restore.isPending}>
                Vazgeç
              </button>
              <button
                className="button danger"
                disabled={confirmation !== 'GERİ YÜKLE' || restore.isPending}
                onClick={() => restore.mutate()}
              >
                Yedeği geri yükle
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
