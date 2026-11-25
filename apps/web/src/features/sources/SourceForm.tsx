import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  sourceInputSchema,
  categories,
  type Category,
  type Preview,
  type Source,
  type SourceInput,
} from '@shared/contracts';
import { Modal, ErrorState, useToast, Badge } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api, patch, post, refreshData } from '../../lib/api';
import { categoryLabels, safeHref } from '../../lib/format';

export function SourceForm({
  open,
  onClose,
  source,
  defaultInterval = 360,
}: {
  open: boolean;
  onClose: () => void;
  source?: Source | null;
  defaultInterval?: number;
}) {
  const [name, setName] = useState(source?.name ?? '');
  const [url, setUrl] = useState(source?.url ?? '');
  const [category, setCategory] = useState<Category>(source?.category ?? 'burs');
  const [kind, setKind] = useState<'rss' | 'html'>(source?.kind ?? 'rss');
  const [selector, setSelector] = useState(source?.selector ?? '');
  const [keywords, setKeywords] = useState(source?.keywords.join(', ') ?? '');
  const [intervalMinutes, setInterval] = useState(source?.intervalMinutes ?? defaultInterval);
  const [created, setCreated] = useState<Source | null>(source ?? null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const toast = useToast();
  const save = useMutation({
    mutationFn: async (input: SourceInput) => {
      const saved = created
        ? await patch<Source>(`/sources/${created.id}`, input)
        : await post<Source>('/sources', input);
      setCreated(saved);
      setDirty(false);
      await refreshData();
      if (saved.baselineRequired) {
        const result = await post<Preview>(`/sources/${saved.id}/preview`);
        setPreview(result);
      } else {
        toast('Kaynak ayarları güncellendi.');
        onClose();
      }
    },
  });
  const retry = useMutation({
    mutationFn: () => post<Preview>(`/sources/${created!.id}/preview`),
    onSuccess: setPreview,
  });
  const baseline = useMutation({
    mutationFn: () =>
      post<Source>(`/sources/${created!.id}/baseline`, { previewId: preview!.previewId }),
    onSuccess: async () => {
      await refreshData();
      toast('Başlangıç görüntüsü onaylandı. Kaynağın takibe hazır.');
      onClose();
    },
  });
  const pending = save.isPending || retry.isPending || baseline.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    const result = sourceInputSchema.safeParse({
      name,
      url,
      category,
      kind,
      selector: kind === 'html' ? selector : undefined,
      keywords: keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      intervalMinutes,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = String(issue.path[0]);
        errs[field] =
          field === 'url'
            ? 'Geçerli bir http:// veya https:// adresi yazın.'
            : field === 'name'
              ? 'Kaynak adı 2–120 karakter olmalı.'
              : issue.message;
      });
      setFieldErrors(errs);
      return;
    }
    save.mutate(result.data);
  };
  const close = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
      title={
        preview
          ? 'Kaynağının ilk görüntüsü'
          : source
            ? 'Kaynağı düzenle'
            : 'Radarına yeni bir kaynak ekle'
      }
      description={
        preview
          ? 'İzlenecek içeriği kontrol et ve başlangıç görüntüsünü onayla.'
          : 'Güvendiğin bir kaynağı ekle. Gelişmeleri birlikte takip edelim.'
      }
      className="source-dialog"
    >
      {discard ? (
        <div className="discard-confirm">
          <Icon name="AlertCircle" size={30} />
          <h3>Kaydedilmemiş değişikliklerin var</h3>
          <p>Pencereyi kapatırsan formdaki düzenlemeler kaybolacak.</p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setDiscard(false)}>
              Düzenlemeye dön
            </button>
            <button className="button danger" onClick={onClose}>
              Kaydetmeden kapat
            </button>
          </div>
        </div>
      ) : preview ? (
        <div className="preview-content">
          <div className="preview-meta">
            <span className="source-preview-icon">
              <Icon name="Rss" size={24} />
            </span>
            <div>
              <h3>{created?.name}</h3>
              <a href={safeHref(created?.url ?? '')} target="_blank" rel="noopener noreferrer">
                {created?.url}
                <Icon name="ExternalLink" size={12} />
              </a>
            </div>
            <Badge tone="green">{preview.itemCount} öğe</Badge>
          </div>
          <div className="preview-items">
            {preview.items.slice(0, 8).map((item, i) => (
              <article key={i}>
                <h4>{item.title}</h4>
                <p>{item.content.slice(0, 700)}</p>
              </article>
            ))}
          </div>
          <div className="info-strip">
            <Icon name="ShieldCheck" />
            <p>
              Bu ilk görüntü bildirim oluşturmaz. Bundan sonraki anlamlı değişiklikler gelen kutuna
              düşer.
            </p>
          </div>
          {baseline.error && <ErrorState error={baseline.error} />}
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setPreview(null)}
              disabled={pending}
            >
              Geri dön
            </button>
            <button className="button primary" onClick={() => baseline.mutate()} disabled={pending}>
              <Icon name={pending ? 'LoaderCircle' : 'Check'} className={pending ? 'spin' : ''} />
              Başlangıç görüntüsünü onayla
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="source-form" onChange={() => setDirty(true)}>
          <div className="form-step">
            <span className="active">
              1 <small>Kaynak bilgileri</small>
            </span>
            <span className="step-line" />
            <span>
              2 <small>Önizle ve onayla</small>
            </span>
          </div>
          <div className="field">
            <label htmlFor="source-name">
              Kaynak adı <span>*</span>
            </label>
            <input
              id="source-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Üniversitem — Burs duyuruları"
              maxLength={120}
              required
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            />
            {fieldErrors.name && (
              <small id="name-error" className="field-error">
                {fieldErrors.name}
              </small>
            )}
          </div>
          <div className="field">
            <label htmlFor="source-url">
              Kaynak bağlantısı <span>*</span>
            </label>
            <div className="input-icon">
              <Icon name="Link" size={17} />
              <input
                id="source-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://kurum.org/duyurular/rss"
                required
                aria-invalid={!!fieldErrors.url}
                aria-describedby={fieldErrors.url ? 'url-error' : 'url-hint'}
              />
            </div>
            {fieldErrors.url ? (
              <small id="url-error" className="field-error">
                {fieldErrors.url}
              </small>
            ) : (
              <small id="url-hint">Kamuya açık HTTP / HTTPS bağlantıları desteklenir.</small>
            )}
          </div>
          <div className="form-columns">
            <div className="field">
              <label htmlFor="source-category">Kategori</label>
              <select
                id="source-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="source-interval">Kontrol sıklığı</label>
              <select
                id="source-interval"
                value={intervalMinutes}
                onChange={(e) => setInterval(Number(e.target.value))}
              >
                <option value={30}>30 dakikada bir</option>
                <option value={60}>Saatte bir</option>
                <option value={360}>6 saatte bir · Önerilen</option>
                <option value={720}>12 saatte bir</option>
                <option value={1440}>Günde bir</option>
              </select>
            </div>
          </div>
          <fieldset className="source-kind">
            <legend>Kaynak türü</legend>
            <label className={kind === 'rss' ? 'selected' : ''}>
              <input
                type="radio"
                name="kind"
                value="rss"
                checked={kind === 'rss'}
                onChange={() => setKind('rss')}
              />
              <Icon name="Rss" size={19} />
              <span>
                RSS / Atom<small>Besleme bağlantısı · Önerilen</small>
              </span>
            </label>
            <label className={kind === 'html' ? 'selected' : ''}>
              <input
                type="radio"
                name="kind"
                value="html"
                checked={kind === 'html'}
                onChange={() => setKind('html')}
              />
              <Icon name="FileText" size={19} />
              <span>
                Statik web sayfası<small>Belirli bir içerik bölgesi</small>
              </span>
            </label>
          </fieldset>
          {kind === 'html' && (
            <div className="field">
              <label htmlFor="source-selector">
                İzlenecek bölgenin CSS seçicisi <span>*</span>
              </label>
              <input
                id="source-selector"
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                placeholder="Örn. #duyurular veya .announcement-list"
                required
                aria-describedby="selector-hint"
              />
              <small id="selector-hint">
                Yalnız bu bölge izlenir. JavaScript ile oluşan sayfalar desteklenmez.
              </small>
              {fieldErrors.selector && (
                <small className="field-error">{fieldErrors.selector}</small>
              )}
            </div>
          )}
          <div className="field">
            <label htmlFor="source-keywords">
              İlgilendiğin anahtar kelimeler <span className="optional">İsteğe bağlı</span>
            </label>
            <input
              id="source-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="burs, yüksek lisans, teknoloji"
              aria-describedby="keywords-hint"
            />
            <small id="keywords-hint">
              Virgülle ayır. Eşleşen gelişmeler öncelikli gösterilir.
            </small>
          </div>
          <div className="form-limit">
            <Icon name="ShieldCheck" size={15} />
            <span>En fazla 50 kaynak. Tarama yalnız uygulama açıkken çalışır.</span>
          </div>
          {(save.error || retry.error) && <ErrorState error={retry.error || save.error} />}
          {created && save.error && (
            <div className="info-strip">
              <Icon name="CheckCircle2" />
              <p>
                Kaynak kaydedildi; ilk görüntü henüz doğrulanmadı. Bilgileri düzeltebilir veya
                önizlemeyi yeniden deneyebilirsin.
              </p>
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={close} disabled={pending}>
              Vazgeç
            </button>
            {created && save.error && !dirty ? (
              <button
                className="button primary"
                type="button"
                disabled={pending}
                onClick={() => retry.mutate()}
              >
                <Icon
                  name={pending ? 'LoaderCircle' : 'RefreshCw'}
                  className={pending ? 'spin' : ''}
                />
                Önizlemeyi yeniden dene
              </button>
            ) : (
              <button className="button primary" disabled={pending} type="submit">
                <Icon
                  name={pending ? 'LoaderCircle' : 'ArrowRight'}
                  className={pending ? 'spin' : ''}
                />
                {pending
                  ? 'Kaynak kontrol ediliyor…'
                  : source && !source.baselineRequired
                    ? 'Değişiklikleri kaydet'
                    : 'Kaydet ve önizle'}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

export async function fetchSources() {
  return api<{ sources: Source[] }>('/sources');
}
