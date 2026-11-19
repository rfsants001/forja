import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Dumbbell, LockKeyhole, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { Settings } from '@forja/core';
import { updateSettings } from '../db/repo';
import { t as translate, type Lang } from '../lib/i18n';
import { useSessionStore } from '../store/session';
import '../styles/startup.css';

const slides = ['plan', 'equipment', 'track', 'data'] as const;
type Slide = typeof slides[number];

function IntroPreview({ slide, lang }: { slide: Slide; lang: Lang }) {
  const t = (key: string) => translate(key, lang);
  return (
    <div className={'intro-preview intro-preview-' + slide} aria-hidden="true">
      <div className="intro-preview-top"><span className="intro-preview-dot" />FORJA <span>{t('intro.example')}</span></div>
      {slide === 'plan' && <>
        <div className="intro-preview-label">{t('intro.plan.preview')}</div>
        <div className="intro-week">
          {['Upper A', 'Lower A', 'Cardio', 'Upper B', 'Lower B'].map((label, index) => <div key={label}>
            <span>{t('wd.short.' + (index + 1))}</span><strong>{label}</strong><Check size={15} />
          </div>)}
        </div>
        <div className="intro-preview-note">{t('intro.plan.note')}</div>
      </>}
      {slide === 'equipment' && <>
        <div className="intro-preview-label">{t('intro.equipment.preview')}</div>
        <div className="intro-equipment">
          <Dumbbell size={46} strokeWidth={1.3} />
          <div><strong>{t('intro.equipment.plates')}</strong><span>4 × 5 kg</span></div>
          <div><strong>{t('intro.equipment.dumbbells')}</strong><span>2 × 10 kg</span></div>
        </div>
        <div className="intro-preview-note"><Check size={16} />{t('intro.equipment.note')}</div>
      </>}
      {slide === 'track' && <>
        <div className="intro-preview-label">{t('intro.track.preview')}</div>
        <div className="intro-chart-value">32 <span>kg</span></div>
        <svg className="intro-chart" viewBox="0 0 300 100" fill="none">
          <path d="M0 80H300M0 40H300" stroke="currentColor" opacity=".12" />
          <path d="M4 85C35 85 28 66 62 66S98 77 120 49S163 62 183 35S226 45 245 22S275 28 296 8" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="296" cy="8" r="4" fill="var(--accent)" />
        </svg>
        <div className="intro-preview-note">{t('intro.track.note')}</div>
      </>}
      {slide === 'data' && <>
        <div className="intro-data-emblem"><LockKeyhole size={40} strokeWidth={1.4} /></div>
        <strong className="intro-data-title">{t('intro.data.preview')}</strong>
        <div className="intro-data-items"><span><Check size={15} />{t('intro.data.local')}</span>
          <span><Check size={15} />{t('intro.data.backup')}</span>
          <span><RefreshCw size={15} />{t('intro.data.sync')}</span></div>
      </>}
    </div>
  );
}

function IntroSlide({ slide, lang, reduce }: { slide: Slide; lang: Lang; reduce: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return (
    <motion.div className="intro-slide" initial={{ opacity: reduce ? 1 : 0, x: reduce ? 0 : 14 }}
      animate={{ opacity: 1, x: 0 }} exit={{ opacity: reduce ? 1 : 0, x: reduce ? 0 : -14 }}
      transition={{ duration: reduce ? 0 : .22 }}>
      <div className="intro-copy"><p className="startup-eyebrow">{translate('intro.' + slide + '.eyebrow', lang)}</p>
        <h1 ref={heading} tabIndex={-1}>{translate('intro.' + slide + '.title', lang)}</h1>
        <p>{translate('intro.' + slide + '.body', lang)}</p>
      </div>
      <IntroPreview slide={slide} lang={lang} />
    </motion.div>
  );
}

/** Mounted before local initialization, so startup never waits on a blank root. */
export function AppStartup({ initialization, children }: { initialization: Promise<Settings>; children: ReactNode }) {
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<'boot' | 'intro' | 'ready' | 'error'>('boot');
  const [lang, setLang] = useState<Lang>('pt');
  const [step, setStep] = useState(0);
  const [hideIntro, setHideIntro] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const t = (key: string, params?: (string | number)[]) => translate(key, lang, params);
  const initialPath = useRef(pathname);
  const reduceAtStart = useRef(reduced);

  useEffect(() => {
    let cancelled = false;
    let cleanupTimer: (() => void) | undefined;
    const minimum = new Promise<void>((resolve) => {
      const id = window.setTimeout(resolve, reduceAtStart.current ? 0 : 1000);
      cleanupTimer = () => window.clearTimeout(id);
    });
    // The initialization promise is shared across StrictMode effect replays.
    void initialization.then((settings) => {
      if (!cancelled) setLang(settings.lang ?? 'pt');
      return minimum.then(() => {
        if (!cancelled) setPhase(settings.hideIntro || useSessionStore.getState().active || initialPath.current === '/conectar'
          ? 'ready' : 'intro');
      });
    }).catch(() => { if (!cancelled) setPhase('error'); });
    return () => { cancelled = true; cleanupTimer?.(); };
  }, [initialization]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const frame = requestAnimationFrame(() => document.getElementById('conteudo')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      if (hideIntro) await updateSettings({ hideIntro: true });
      setPhase('ready');
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'ready') return children;

  if (phase === 'boot' || phase === 'error') return (
    <main className="startup-boot" aria-labelledby="startup-title">
      <div className={'startup-mark' + (phase === 'boot' ? ' is-loading' : '')}>
        <img src="/favicon.svg" width="64" height="64" alt="" />
      </div>
      <p className="startup-eyebrow">FORJA</p>
      <h1 id="startup-title">{t('startup.title')}</h1>
      <p role={phase === 'error' ? 'alert' : 'status'}>{t(phase === 'error' ? 'startup.error' : 'startup.loading')}</p>
      {phase === 'boot' ? <div className="startup-loader" aria-hidden="true"><span /></div>
        : <button className="intro-button primary" onClick={() => window.location.reload()}>{t('startup.retry')}</button>}
    </main>
  );

  return (
    <main className="startup-intro" aria-label={t('intro.label')}>
      <div className="intro-shell">
        <header className="intro-header"><div className="intro-brand"><img src="/favicon.svg" width="30" height="30" alt="" />FORJA</div>
          <button type="button" className="intro-button quiet" disabled={saving} onClick={() => void finish()}>{t('intro.skip')}</button></header>
        <AnimatePresence mode="wait" initial={false}>
          <IntroSlide key={step} slide={slides[step]!} lang={lang} reduce={!!reduced} />
        </AnimatePresence>
        <footer className="intro-footer">
          <div className="intro-progress" role="group" aria-label={t('intro.slides')}>
            {slides.map((slide, index) => <button key={slide} type="button" disabled={saving}
              aria-label={t('intro.goTo', [index + 1, slides.length])} aria-current={step === index ? 'step' : undefined}
              onClick={() => setStep(index)}><span /></button>)}
            <span>{step + 1} / {slides.length}</span>
          </div>
          <label className="intro-hide"><input type="checkbox" checked={hideIntro} disabled={saving}
            onChange={(event) => setHideIntro(event.target.checked)} />{t('intro.hide')}</label>
          {error && <p className="intro-error" role="alert">{t('intro.saveError')}</p>}
          <div className="intro-navigation">
            {step > 0 && <button type="button" className="intro-button quiet" disabled={saving} onClick={() => setStep(step - 1)}><ArrowLeft size={16} />{t('intro.back')}</button>}
            <button type="button" className="intro-button primary" disabled={saving}
              onClick={() => step === slides.length - 1 ? void finish() : setStep(step + 1)}>
              {t(saving ? 'intro.saving' : step === slides.length - 1 ? 'intro.start' : 'intro.next')}<ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
