import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { SessionInfo, Source } from '@shared/contracts';
import { Icon, RadarMark } from '../../components/Icon';
import { ErrorState, Badge } from '../../components/ui';
import { patch, post, queryClient, setSessionToken } from '../../lib/api';
export function Pairing() {
  const [code, setCode] = useState('');
  const [timezone, setTimezone] = useState('Europe/Istanbul');
  const pairing = useMutation({
    mutationFn: async () => {
      const session = await post<SessionInfo>('/pair', { code: code.trim() });
      setSessionToken(session);
      await patch('/settings', { timezone });
      return session;
    },
    onSuccess: (session) => queryClient.setQueryData(['session'], session),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    pairing.mutate();
  };
  return (
    <div className="pairing-page">
      <div className="pairing-brand">
        <RadarMark />
        <span>fırsatradarı</span>
      </div>
      <div className="pairing-layout">
        <section className="pairing-story">
          <Badge tone="green" dot>
            SENİN KİŞİSEL FIRSAT MASAN
          </Badge>
          <h1>
            Kaynakların bir arada.
            <br />
            <span>Kararların kanıtıyla.</span>
          </h1>
          <p>
            Fırsatı zamanında gör,
            <br />
            başvurunu kanıtıyla takip et.
          </p>
          <div className="pairing-features">
            <span>
              <Icon name="Radio" />
              Güvendiğin kaynakları takip et
            </span>
            <span>
              <Icon name="FileText" />
              Değişikliği kanıtıyla gör
            </span>
            <span>
              <Icon name="CalendarDays" />
              Son tarihleri kontrolünde tut
            </span>
          </div>
          <div className="pairing-radar" aria-hidden="true">
            <RadarMark />
          </div>
          <div className="pairing-privacy">
            <Icon name="ShieldCheck" size={18} />
            <span>Yerel çalışır. Verilerin bu bilgisayarda kalır.</span>
          </div>
        </section>
        <section className="pairing-card">
          <span className="pairing-lock">
            <Icon name="LockKeyhole" size={25} />
          </span>
          <h2>Çalışma alanına hoş geldin.</h2>
          <p>Güvenli bir başlangıç için bu tarayıcıyı yerel uygulamanla eşleştir.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="pair-code">Terminaldeki eşleştirme kodu</label>
              <input
                id="pair-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Eşleştirme kodunu yaz"
                autoComplete="one-time-code"
                required
                autoFocus
                aria-describedby="pair-code-help"
              />
              <small id="pair-code-help">
                Uygulamayı başlattığın terminaldeki tek kullanımlık kod. Kod kısa süre içinde
                geçersiz olur.
              </small>
            </div>
            <div className="field">
              <label htmlFor="initial-timezone">Saat dilimin</label>
              <select
                id="initial-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="Europe/Istanbul">İstanbul · Europe/Istanbul</option>
                <option value="Europe/Berlin">Berlin · Europe/Berlin</option>
                <option value="Europe/London">Londra · Europe/London</option>
                <option value="America/New_York">New York · America/New_York</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            {pairing.error && <ErrorState error={pairing.error} />}
            <button className="button primary full" disabled={pairing.isPending || !code.trim()}>
              <span>{pairing.isPending ? 'Eşleştiriliyor…' : 'Çalışma alanımı aç'}</span>
              <Icon
                name={pairing.isPending ? 'LoaderCircle' : 'ArrowRight'}
                className={pairing.isPending ? 'spin' : ''}
              />
            </button>
          </form>
          <div className="pairing-note">
            <Icon name="ShieldCheck" size={15} />
            <span>Kodun tarayıcıda kalıcı olarak saklanmaz.</span>
          </div>
        </section>
      </div>
      <footer>
        Fırsat Radarı <span>·</span> Fırsatların için, senin yanında.
      </footer>
    </div>
  );
}
export function OnboardingBanner({ sources, onAdd }: { sources: Source[]; onAdd: () => void }) {
  const valid = sources.filter((s) => !s.baselineRequired).length;
  return (
    <section className="onboarding-banner">
      <div className="onboarding-symbol">
        <RadarMark />
      </div>
      <div className="onboarding-copy">
        <span>RADARINI HAZIRLAYALIM</span>
        <h2>{valid >= 3 ? 'Kaynakların hazır. İlk kararını ver.' : 'İlk üç kaynağınla başla.'}</h2>
        <p>
          {valid >= 3
            ? 'İlk anlamlı değişiklik gelen kutunda göründüğünde kanıtını incele ve kararını kaydet.'
            : 'Takip ettiğin duyuruları ekle, ilk görüntülerini onayla. Değişiklikleri bu masada incele.'}
        </p>
        <div className="onboarding-progress">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < valid ? 'complete' : ''}>
              {i < valid ? <Icon name="Check" size={12} /> : i + 1}
            </span>
          ))}
          <small>{Math.min(valid, 3)} / 3 kaynak hazır</small>
        </div>
      </div>
      {valid < 3 && (
        <button className="button primary" onClick={onAdd}>
          <Icon name="Plus" size={16} />
          {sources.length ? 'Kaynak ekle' : 'İlk kaynağımı ekle'}
        </button>
      )}
    </section>
  );
}
