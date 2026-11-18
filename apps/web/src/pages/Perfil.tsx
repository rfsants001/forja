import { errorMessage } from '../lib/ui-error';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import '../styles/perfil.css';
import '../styles/print.css';

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  User, Trash2, CheckCircle2, Download, Upload,
  Database, ArrowDownToLine, Share2, Printer, FileInput, ClipboardList, PlugZap, Laptop, ChevronRight,
} from 'lucide-react';
import { DEFAULT_SETTINGS, toISO } from '@forja/core';
import type { Settings, BodyWeight } from '@forja/core';
import { db } from '../db/db';
import { updateSettings, addBodyWeight, deleteBodyWeight } from '../db/repo';
import { downloadBackup, parseBackup, restoreBackup } from '../lib/backup';
import type { BackupMode, ParsedBackup } from '../lib/backup';
import {
  parseFitNotes, parseStrong, parseHevy, parseAppleHealthWeight,
  applyImport, previewImport,
} from '../lib/importers';
import type { ImportResult } from '../lib/importers';
import { downloadPlan, importPlan, printPlan } from '../lib/plan-share';

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  // "2024-11-10" → "10/11/24"
  const parts = iso.split('-');
  const y = parts[0] ?? '';
  const m = parts[1] ?? '';
  const d = parts[2] ?? '';
  return `${d}/${m}/${y.slice(2)}`;
}

// ---------------------------------------------------------------------------
// Gráfico de linha em SVG puro
// ---------------------------------------------------------------------------

interface WeightChartProps {
  points: BodyWeight[];
  goalKg?: number;
}

function WeightChart({ points, goalKg }: WeightChartProps) {
  const t = useT();
  // Precisamos de ao menos 2 pontos para traçar uma linha
  if (points.length < 2) {
    return (
      <p className="hint" style={{ textAlign: 'center', padding: '20px 0' }}>{t("perf.atLeast2")}</p>
    );
  }

  // Dimensões lógicas do viewBox
  const W = 300;
  const H = 140;
  const PAD_LEFT = 36;
  const PAD_RIGHT = 12;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;

  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;

  // Dados ordenados por data
  const sorted = [...points].sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // Escala Y
  const kgValues = sorted.map((p) => p.kg);
  // Incluir a meta na escala, se houver
  const allYValues = goalKg !== undefined ? [...kgValues, goalKg] : kgValues;

  const minKg = Math.min(...allYValues);
  const maxKg = Math.max(...allYValues);

  // Margem vertical de 10% (mínimo 1 kg para não degenerar)
  const rawRange = maxKg - minKg;
  const margin = Math.max(rawRange * 0.1, 1);
  const yMin = minKg - margin;
  const yMax = maxKg + margin;
  const yRange = yMax - yMin;

  // Escala X (baseada em índice — equidistante)
  const n = sorted.length;

  function scaleX(i: number): number {
    if (n <= 1) return PAD_LEFT + plotW / 2;
    return PAD_LEFT + (i / (n - 1)) * plotW;
  }

  function scaleY(kg: number): number {
    // SVG: Y=0 no topo → inverte
    return PAD_TOP + ((yMax - kg) / yRange) * plotH;
  }

  // Polyline points
  const linePoints = sorted
    .map((p, i) => `${scaleX(i).toFixed(1)},${scaleY(p.kg).toFixed(1)}`)
    .join(' ');

  // Rótulos do eixo Y (3 ticks)
  const yTicks = [yMin + yRange * 0.0, yMin + yRange * 0.5, yMin + yRange * 1.0];

  // Primeiros e últimos rótulos do eixo X
  const firstPoint = sorted[0];
  const lastPoint = sorted[n - 1];

  // Ponto hover — o último registro
  const lastPtX = scaleX(n - 1);
  const lastPtY = lastPoint !== undefined ? scaleY(lastPoint.kg) : 0;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} aria-label={t("perf.weightChartAriaLabel")}>
        {/* Eixo Y: linha e ticks */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={PAD_TOP + plotH}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {yTicks.map((tick) => {
          const y = scaleY(tick).toFixed(1);
          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT - 4}
                y1={y}
                x2={PAD_LEFT + plotW}
                y2={y}
                stroke="var(--border-soft)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={PAD_LEFT - 6}
                y={parseFloat(y) + 4}
                textAnchor="end"
                className="chart-axis-label"
              >
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Eixo X: linha e datas extremas */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + plotH}
          x2={PAD_LEFT + plotW}
          y2={PAD_TOP + plotH}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {firstPoint !== undefined && (
          <text
            x={PAD_LEFT}
            y={H - 6}
            textAnchor="start"
            className="chart-axis-label"
          >
            {fmtDate(firstPoint.dateISO)}
          </text>
        )}
        {lastPoint !== undefined && n > 1 && (
          <text
            x={PAD_LEFT + plotW}
            y={H - 6}
            textAnchor="end"
            className="chart-axis-label"
          >
            {fmtDate(lastPoint.dateISO)}
          </text>
        )}

        {/* Linha de meta (tracejada, se houver) */}
        {goalKg !== undefined && (
          <g>
            <line
              x1={PAD_LEFT}
              y1={scaleY(goalKg)}
              x2={PAD_LEFT + plotW}
              y2={scaleY(goalKg)}
              stroke="var(--ok)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              opacity="0.8"
            />
            <text
              x={PAD_LEFT + plotW + 2}
              y={scaleY(goalKg) + 4}
              textAnchor="start"
              className="chart-goal-label"
            >
              {goalKg}
            </text>
          </g>
        )}

        {/* Linha principal */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--flame)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Ponto destaque: último registro */}
        <circle
          cx={lastPtX}
          cy={lastPtY}
          r="4"
          fill="var(--flame)"
          stroke="var(--surface)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário de peso corporal
// ---------------------------------------------------------------------------

function BodyWeightForm() {
  const t = useT();
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(toISO(new Date()));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(kg);
    if (isNaN(parsed) || parsed <= 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await addBodyWeight({ dateISO: date, kg: parsed });
      setKg('');
      setDate(toISO(new Date()));
      setStatus({ text: t('ui.weightSaved') });
    } catch {
      setStatus({ text: t('ui.weightFailed'), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="bw-form" onSubmit={(e) => { void handleSubmit(e); }}>
      <div className="bw-field" style={{ maxWidth: 100 }}>
        <label htmlFor="bw-kg">{t("perf.weightKgLabel")}</label>
        <input
          id="bw-kg"
          className="bw-input"
          type="number"
          inputMode="decimal"
          step="any"
          min="1"
          max="500"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          required
        />
      </div>
      <div className="bw-field">
        <label htmlFor="bw-date">{t("perf.dateLabel")}</label>
        <input
          id="bw-date"
          className="bw-input"
          type="date"
          value={date}
          max={toISO(new Date())}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <button
        className="btn"
        type="submit"
        disabled={busy}
        style={{ flexShrink: 0, alignSelf: 'flex-end' }}
      >
        {busy ? t("ui.logging") : t("ui.logWeight")}
      </button>
      {status && <p className={status.error ? 'field-error' : 'hint'} role={status.error ? 'alert' : 'status'}>{status.text}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Lista de registros de peso
// ---------------------------------------------------------------------------

function BodyWeightList({ entries }: { entries: BodyWeight[] }) {
  const t = useT();
  if (entries.length === 0) {
    return (
      <p className="hint" style={{ textAlign: 'center', padding: '12px 0' }}>{t("perf.noEntries")}</p>
    );
  }

  async function handleDelete(dateISO: string) {
    if (!window.confirm(`Excluir registro de ${fmtDate(dateISO)}?`)) return;
    await deleteBodyWeight(dateISO);
  }

  return (
    <div className="bw-list">
      {entries.map((item) => (
        <div key={item.dateISO} className="bw-item">
          <span className="bw-date">{fmtDate(item.dateISO)}</span>
          <span className="bw-kg">{item.kg.toFixed(1)} kg</span>
          <button
            className="bw-del"
            aria-label={t('prof.deleteWeight', [fmtDate(item.dateISO)])}
            onClick={() => { void handleDelete(item.dateISO); }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seção de configurações
// ---------------------------------------------------------------------------

/** Chave usada para feedback de "salvo" */
type SettingKey = 'lang' | 'unit' | 'defaultRestSec' | 'theme' | 'accent' | 'weekStartsOn' | 'trackEffort' | 'bodyWeightGoalKg';

/** Paletas de acento disponíveis */
const ACCENT_PALETTES: { name: string; label: string; color: string }[] = [
  { name: 'amber',   label: 'Âmbar',   color: '#f5a623' },
  { name: 'flame',   label: 'Índigo',  color: '#6551dd' },
  { name: 'blue',    label: 'Azul',    color: '#3b8ff5' },
  { name: 'violet',  label: 'Violeta', color: '#9b5de5' },
  { name: 'green',   label: 'Verde',   color: '#22c55e' },
  { name: 'rose',    label: 'Rosa',    color: '#f43f5e' },
  { name: 'cyan',    label: 'Ciano',   color: '#06b6d4' },
  { name: 'magenta', label: 'Magenta', color: '#d946ef' },
];

function SettingsSection({ settings }: { settings: Settings }) {
  const t = useT();
  // Estados locais sincronizados com a setting reativa
  const [restSec, setRestSec] = useState(String(settings.defaultRestSec));
  const [goalKg, setGoalKg] = useState(
    settings.bodyWeightGoalKg !== undefined ? String(settings.bodyWeightGoalKg) : '',
  );
  const [savedKey, setSavedKey] = useState<SettingKey | null>(null);
  const saveTimer = useRef<number | null>(null);

  // Sincronizar campos de texto quando settings muda externamente
  const prevRestSecRef = useRef(settings.defaultRestSec);
  const prevGoalKgRef = useRef(settings.bodyWeightGoalKg);
  useEffect(() => {
    if (prevRestSecRef.current !== settings.defaultRestSec) {
      setRestSec(String(settings.defaultRestSec));
      prevRestSecRef.current = settings.defaultRestSec;
    }
    if (prevGoalKgRef.current !== settings.bodyWeightGoalKg) {
      setGoalKg(settings.bodyWeightGoalKg !== undefined ? String(settings.bodyWeightGoalKg) : '');
      prevGoalKgRef.current = settings.bodyWeightGoalKg;
    }
  }, [settings.defaultRestSec, settings.bodyWeightGoalKg]);

  const [settingsError, setSettingsError] = useState('');
  const [savingNumbers, setSavingNumbers] = useState(false);
  const numbersChanged = restSec !== String(settings.defaultRestSec)
    || goalKg !== String(settings.bodyWeightGoalKg ?? '');

  async function saveNumbers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingNumbers) return;
    setSettingsError('');
    const rest = Number(restSec);
    const goal = goalKg.trim() ? Number(goalKg) : undefined;
    if (!Number.isInteger(rest) || rest < 0 || rest > 600 || (goal !== undefined && (goal < 1 || goal > 500 || !Number.isFinite(goal)))) {
      setSettingsError(t('ui.prefRange'));
      return;
    }
    setSavingNumbers(true);
    try {
      await updateSettings({ defaultRestSec: rest, bodyWeightGoalKg: goal });
      flashSaved('defaultRestSec');
    } catch {
      setSettingsError(t('ui.prefSaveFailed'));
    } finally {
      setSavingNumbers(false);
    }
  }

  function flashSaved(key: SettingKey) {
    setSavedKey(key);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSavedKey(null), 2000);
  }

  async function saveSetting(patch: Partial<Settings>, key: SettingKey) {
    setSettingsError('');
    try {
      await updateSettings(patch);
      flashSaved(key);
    } catch {
      setSettingsError(t('ui.settingSaveFailed'));
    }
  }

  function SavedBadge({ k }: { k: SettingKey }) {
  const t = useT();
    if (savedKey !== k) return null;
    return (
      <span className="save-badge" role="status">
        <CheckCircle2 size={12} />{t("perf.savedBadge")}</span>
    );
  }

  return (
    <div className="card">
      {/* Unidade */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">{t("perf.unitLabel")}</span>
        </div>
        <SavedBadge k="unit" />
        <div className="toggle-group">
          <button
            className={settings.unit === 'kg' ? 'active' : ''} aria-pressed={settings.unit === 'kg'}
            onClick={() => { void saveSetting({ unit: 'kg' }, 'unit'); }}
          >
            kg
          </button>
          <button
            className={settings.unit === 'lb' ? 'active' : ''} aria-pressed={settings.unit === 'lb'}
            onClick={() => { void saveSetting({ unit: 'lb' }, 'unit'); }}
          >
            lb
          </button>
        </div>
      </div>

      <div className="setting-row">
        <label className="setting-label" htmlFor="profile-lang"><span className="lbl">{t('locale.language')}</span></label>
        <SavedBadge k="lang" />
        <select className="setting-select" id="profile-lang" value={settings.lang ?? 'pt'}
          onChange={(event) => void saveSetting({ lang: event.target.value === 'en' ? 'en' : 'pt' }, 'lang')}>
          <option value="pt">Português (Brasil)</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Tema */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">{t('locale.theme')}</span>
        </div>
        <SavedBadge k="theme" />
        <select
          className="setting-select"
          value={settings.theme}
          onChange={(e) => { void saveSetting({ theme: e.target.value as Settings['theme'] }, 'theme'); }}
          aria-label={t('locale.appearance')}
        >
          <option value="dark">{t('locale.dark')}</option>
          <option value="light">{t('locale.light')}</option>
          <option value="system">{t('locale.system')}</option>
        </select>
      </div>

      {/* Cor de acento */}
      <div className="setting-row accent-row">
        <div className="setting-label">
          <span className="lbl">{t('locale.accent')}</span>
          <SavedBadge k="accent" />
        </div>
        <div className="accent-swatches" role="group" aria-label={t('locale.accent')}>
          {ACCENT_PALETTES.map((p) => {
            const active = (settings.accent ?? DEFAULT_SETTINGS.accent) === p.name;
            return (
              <button
                key={p.name}
                className={`accent-swatch${active ? ' active' : ''}`}
                style={{ '--swatch-color': p.color } as React.CSSProperties}
                aria-label={p.label}
                aria-pressed={active}
                title={p.label}
                onClick={() => { void saveSetting({ accent: p.name }, 'accent'); }}
              />
            );
          })}
        </div>
      </div>

      {/* Início da semana */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">{t("perf.weekStartLabel")}</span>
        </div>
        <SavedBadge k="weekStartsOn" />
        <div className="toggle-group">
          <button
            className={settings.weekStartsOn === 0 ? 'active' : ''} aria-pressed={settings.weekStartsOn === 0}
            onClick={() => { void saveSetting({ weekStartsOn: 0 }, 'weekStartsOn'); }}
          >{t("perf.weekSun")}</button>
          <button
            className={settings.weekStartsOn === 1 ? 'active' : ''} aria-pressed={settings.weekStartsOn === 1}
            onClick={() => { void saveSetting({ weekStartsOn: 1 }, 'weekStartsOn'); }}
          >{t("perf.weekMon")}</button>
        </div>
      </div>

      {/* Rastrear esforço */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">{t("perf.effortLabel")}</span>
          <span className="sub">{t("perf.effortSub")}</span>
        </div>
        <SavedBadge k="trackEffort" />
        <div className="toggle-group">
          <button
            className={settings.trackEffort ? 'active' : ''} aria-pressed={settings.trackEffort}
            onClick={() => { void saveSetting({ trackEffort: true }, 'trackEffort'); }}
          >{t("perf.effortOn")}</button>
          <button
            className={!settings.trackEffort ? 'active' : ''} aria-pressed={!settings.trackEffort}
            onClick={() => { void saveSetting({ trackEffort: false }, 'trackEffort'); }}
          >{t("perf.effortOff")}</button>
        </div>
      </div>

      <form className="profile-preferences" onSubmit={(event) => void saveNumbers(event)}>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="profile-rest">{t("ui.restBetweenSets")}</label>
            <input id="profile-rest" type="number" inputMode="numeric" min={0} max={600} step={1}
              value={restSec} onChange={(event) => setRestSec(event.target.value)}
              aria-label={t("perf.restAriaLabel")} aria-describedby="profile-rest-help" required />
            <span className="hint" id="profile-rest-help">{t("ui.restHelp")}</span>
          </div>
          <div className="field">
            <label htmlFor="profile-goal">{t("ui.weightGoal")}</label>
            <input id="profile-goal" type="number" inputMode="decimal" min={1} max={500} step="any"
              value={goalKg} onChange={(event) => setGoalKg(event.target.value)} aria-label={t("perf.goalAriaLabel")} />
            <span className="hint">{t("ui.removeGoal")}</span>
          </div>
        </div>
        <div className="form-actions">
          <SavedBadge k="defaultRestSec" />
          <button className="btn" type="submit" disabled={!numbersChanged || savingNumbers}>{savingNumbers ? t("ex.savingNote") : t("ui.savePreferences")}</button>
        </div>
      </form>
      {settingsError && <p className="field-error" role="alert">{settingsError}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seção de dados (export/import)
// ---------------------------------------------------------------------------

function SeusDadosSection() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  const [pending, setPending] = useState<{ name: string; backup: ParsedBackup } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (pending !== null) heading.current?.focus(); }, [pending]);

  function showFeedback(msg: string, type: 'ok' | 'error') {
    setFeedback(msg);
    setStatus(type);
  }

  async function handleExport() {
    setStatus('busy');
    try {
      await downloadBackup();
      showFeedback(t('ui.backupExported'), 'ok');
    } catch (err) {
      showFeedback(
        errorMessage(err, t, 'ui.exportError'),
        'error',
      );
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setPending(null);
    setStatus('busy');
    setFeedback(null);
    setReplacing(false);
    try {
      setPending({ name: file.name, backup: parseBackup(await file.text()) });
      setStatus('idle');
    } catch (err) {
      showFeedback(errorMessage(err, t, 'ui.importError'), 'error');
    }
  }

  async function handleRestore(mode: BackupMode) {
    if (pending === null) return;
    setStatus('busy');
    setFeedback(null);
    try {
      const counts = await restoreBackup(pending.backup, mode);
      setPending(null);
      showFeedback(t('ui.backupRestored', [counts.workouts ?? 0]), 'ok');
    } catch (error) {
      showFeedback(errorMessage(error, t, 'ui.restoreError'), 'error');
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Database size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <p className="hint" style={{ lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>{t("perf.localFirstStrong")}</strong>{t("ui.backupExplainer")}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {/* Exportar */}
        <button
          className="btn"
          disabled={status === 'busy'}
          onClick={() => { void handleExport(); }}
          style={{ flex: '1 1 auto' }}
        >
          <Download size={15} />{t("perf.exportBackup")}</button>

        {/* Importar — input oculto disparado pelo botão ghost */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => { void handleFileChange(e); }}
        />
        <button
          className="btn ghost"
          disabled={status === 'busy'}
          ref={importButton}
          onClick={() => fileInputRef.current?.click()}
          style={{ flex: '1 1 auto' }}
        >
          <Upload size={15} />{t("perf.importBackup")}</button>
      </div>

      {pending !== null && (
        <section className="restore-options" aria-labelledby="restore-title" aria-busy={status === 'busy'}>
          <h3 id="restore-title" tabIndex={-1} ref={heading}>{t("ui.restore")}</h3>
          <p>{pending.name} · {t('hist.manyWorkouts', [pending.backup.data.workouts?.length ?? 0])}</p>
          {pending.backup.version === 1 && <p className="hint">{t("ui.legacyBackup")}</p>}
          <p className="hint">{t("ui.restoreHelp")}</p>
          <div className="btn-row">
            <button className="btn ghost" disabled={status === 'busy'} onClick={() => {
              setPending(null); setReplacing(false); importButton.current?.focus();
            }}>{t("perf.cancel")}</button>
            <button className="btn" disabled={status === 'busy'} onClick={() => void handleRestore('merge')}>{t("ui.mergeData")}</button>
            <button className="btn danger" disabled={status === 'busy'} onClick={() => setReplacing(true)}>{t("ui.replaceData")}</button>
          </div>
          {replacing && (
            <div className="feedback error">
              <p>{t("ui.confirmReplaceHelp")}</p>
              <button className="btn danger" disabled={status === 'busy'} onClick={() => void handleRestore('replace')}>{t("ui.confirmReplace")}</button>
            </div>
          )}
        </section>
      )}
      {status === 'busy' && <p role="status" className="feedback">{t("ui.processingBackup")}</p>}

      {/* Feedback */}
      {feedback !== null && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          style={{
            marginTop: 10,
            fontSize: 13,
            color: status === 'ok' ? 'var(--ok)' : 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {status === 'ok' && <CheckCircle2 size={14} />}
          {feedback}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seção G5 — Importar de outro app
// ---------------------------------------------------------------------------

type ImportSource = 'fitnotes' | 'strong' | 'hevy' | 'applehealth';

interface ImportPreview {
  workouts: number;
  exercises: number;
  bodyweight: number;
  unrecognized: string[];
  result: ImportResult;
}

function ImportarAppSection() {
  const t = useT();
  const [source, setSource] = useState<ImportSource>('fitnotes');
  const [status, setStatus] = useState<'idle' | 'parsing' | 'preview' | 'applying' | 'done' | 'error'>('idle');
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sourceOptions: Array<{ value: ImportSource; label: string; accept: string }> = [
    { value: 'fitnotes',   label: 'FitNotes',     accept: '.csv,text/csv' },
    { value: 'strong',     label: 'Strong',        accept: '.csv,text/csv' },
    { value: 'hevy',       label: 'Hevy',          accept: '.csv,text/csv' },
    { value: 'applehealth',label: 'Apple Health (peso)', accept: '.xml,application/xml,text/xml' },
  ];

  function showError(msg: string) {
    setFeedback(msg);
    setStatus('error');
  }

  function resetState() {
    setStatus('idle');
    setApplying(false);
    setFeedback(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('parsing');
    setFeedback(null);
    setPreview(null);

    try {
      const text = await file.text();

      let result: ImportResult;
      if (source === 'fitnotes')    result = parseFitNotes(text);
      else if (source === 'strong') result = parseStrong(text);
      else if (source === 'hevy')   result = parseHevy(text);
      else                          result = parseAppleHealthWeight(text);

      const unrecognized = await previewImport(result);
      setPreview({
        workouts: result.workouts.length,
        exercises: unrecognized.length,
        bodyweight: result.bodyweight.length,
        unrecognized,
        result,
      });
      setStatus('preview');
    } catch (err) {
      showError(errorMessage(err, t, 'ui.importError'));
    }
  }

  async function handleConfirm() {
    if (preview === null) return;
    setApplying(true);
    setStatus('applying');
    try {
      const counts = await applyImport(preview.result);
      setFeedback(
        t('perf.importDone', [counts.workouts, counts.exercises]) +
        (counts.bodyweight > 0 ? t('perf.importBodyweight', [counts.bodyweight]) : '') +
        (counts.duplicates > 0 ? t('perf.importDuplicates', [counts.duplicates]) : '') + '.',
      );
      setStatus('done');
      setPreview(null);
    } catch (err) {
      showError(errorMessage(err, t, 'ui.importError'));
    } finally {
      setApplying(false);
    }
  }

  const currentSource = sourceOptions.find((s) => s.value === source);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FileInput size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <p className="hint" style={{ lineHeight: 1.5 }}>{t("ui.importHelp")}</p>
      </div>

      {/* Seletor de origem */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {sourceOptions.map((opt) => (
          <button
            key={opt.value}
            className={`btn ghost${source === opt.value ? ' active-source' : ''}`}
            style={{
              flex: '1 1 auto',
              borderColor: source === opt.value ? 'var(--flame)' : undefined,
              color: source === opt.value ? 'var(--flame)' : undefined,
            }}
            onClick={() => { setSource(opt.value); resetState(); }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Upload */}
      {status !== 'done' && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={currentSource?.accept ?? '.csv,.xml'}
            style={{ display: 'none' }}
            onChange={(e) => { void handleFile(e); }}
          />
          <button
            className="btn"
            style={{ width: '100%' }}
            disabled={status === 'parsing' || status === 'applying'}
            onClick={() => fileInputRef.current?.click()}
          >
            <ArrowDownToLine size={15} />
            {status === 'parsing' ? t("perf.processing") : `Selecionar arquivo ${currentSource?.label ?? ''}`}
          </button>
        </>
      )}

      {/* Preview */}
      {status === 'preview' && preview !== null && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t("perf.previewTitle")}</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <li><span style={{ color: 'var(--text-muted)' }}>{t("perf.previewWorkouts")}</span> <strong>{preview.workouts}</strong></li>
            <li><span style={{ color: 'var(--text-muted)' }}>{t("perf.previewNewEx")}</span> <strong>{preview.exercises}</strong></li>
            {(preview.result.skippedRows ?? 0) > 0 && <li>{t('ui.ignoredRows', [preview.result.skippedRows ?? 0])}</li>}
            {preview.bodyweight > 0 && (
              <li><span style={{ color: 'var(--text-muted)' }}>{t("perf.previewWeights")}</span> <strong>{preview.bodyweight}</strong></li>
            )}
            {preview.unrecognized.length > 0 && (
              <li style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>{t("perf.previewUnrecognized")}</span>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {preview.unrecognized.slice(0, 8).join(', ')}
                  {preview.unrecognized.length > 8 && ` … +${preview.unrecognized.length - 8}`}
                </div>
              </li>
            )}
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={applying}
              onClick={() => { void handleConfirm(); }}
            >
              <CheckCircle2 size={14} />
              {applying ? t("perf.applying") : t("perf.confirmImport")}
            </button>
            <button className="btn ghost" onClick={resetState}>{t("perf.cancel")}</button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback !== null && (
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            color: status === 'done' ? 'var(--ok)' : 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {status === 'done' && <CheckCircle2 size={14} />}
          {feedback}
        </p>
      )}
      {status === 'done' && (
        <button className="btn ghost" style={{ marginTop: 10, width: '100%' }} onClick={resetState}>{t("perf.importAnother")}</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seção G6 — Compartilhar plano
// ---------------------------------------------------------------------------

function CompartilharPlanoSection() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [replacePlanDays, setReplacePlanDays] = useState(false);

  function showFeedback(msg: string, type: 'ok' | 'error') {
    setFeedback(msg);
    setStatus(type);
    window.setTimeout(() => { setFeedback(null); setStatus('idle'); }, 4000);
  }

  async function handleExport() {
    setStatus('busy');
    try {
      await downloadPlan();
      showFeedback(t('ui.planExported'), 'ok');
    } catch (err) {
      showFeedback(errorMessage(err, t, 'ui.exportError'), 'error');
    }
  }

  async function handlePrint() {
    setStatus('busy');
    try {
      await printPlan();
      setStatus('idle');
    } catch (err) {
      showFeedback(errorMessage(err, t, 'file.printWindow'), 'error');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setStatus('busy');
    try {
      const json = await file.text();
      const counts = await importPlan(json, replacePlanDays);
      showFeedback(
        t('perf.planImported', [counts.categories, counts.routines, counts.weekPlan]) +
        (counts.preservedDays > 0 ? ` ${t('sp.preservedDays', [counts.preservedDays])}` : ''),
        'ok',
      );
    } catch (err) {
      showFeedback(errorMessage(err, t, 'ui.importError'), 'error');
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Share2 size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <p className="hint" style={{ lineHeight: 1.5 }}>{t("perf.shareHint")}</p>
      </div>

      <label className="starter-replace">
        <input type="checkbox" checked={replacePlanDays} onChange={(event) => setReplacePlanDays(event.target.checked)} />{t("ui.replacePlanDays")}</label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn"
          style={{ flex: '1 1 auto' }}
          disabled={status === 'busy'}
          onClick={() => { void handleExport(); }}
        >
          <Download size={15} />{t("perf.exportPlan")}</button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => { void handleFileChange(e); }}
        />
        <button
          className="btn ghost"
          style={{ flex: '1 1 auto' }}
          disabled={status === 'busy'}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={15} />{t("perf.importPlan")}</button>

        <button
          className="btn ghost"
          style={{ flex: '1 1 auto' }}
          disabled={status === 'busy'}
          onClick={() => { void handlePrint(); }}
        >
          <Printer size={15} />{t("perf.printPlan")}</button>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {t('ui.printHint')}</p>

      {feedback !== null && (
        <p
          style={{
            marginTop: 10,
            fontSize: 13,
            color: status === 'ok' ? 'var(--ok)' : 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {status === 'ok' && <CheckCircle2 size={14} />}
          {feedback}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function Perfil() {
  const t = useT();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== '#importar-historico') return;
    const heading = document.getElementById('importar-historico');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView();
  }, [hash]);
  const rawSettings = useLiveQuery(() => db.settings.get('app'), []);

  // Funde com DEFAULT_SETTINGS para garantir que todos os campos existam
  const settings: Settings = rawSettings !== undefined
    ? { ...DEFAULT_SETTINGS, ...rawSettings }
    : { ...DEFAULT_SETTINGS };

  // Registros de peso ordenados por data (desc — mais recente primeiro na lista)
  const bodyWeightEntries = useLiveQuery(
    () => db.bodyweight.orderBy('dateISO').toArray(),
    [],
  );

  const entries = bodyWeightEntries ?? [];
  // Versão decrescente para exibição na lista
  const entriesDesc = [...entries].reverse();

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <span className="mark">
            <User size={20} strokeWidth={2.4} />
          </span>
          <h1>
            {t('nav.profile')}
          </h1>
        </div>
      </div>

      <div className="profile-layout">
        <section aria-labelledby="profile-settings">
          <h2 className="section-title" id="profile-settings">{t('perf.settingsTitle')}</h2>
          <nav className="profile-tools" aria-label={t('perf.settingsTitle')}>
            {([
              ['/perfil/assistente', 'coach.title', 'profile.assistantHint', ClipboardList],
              ['/perfil/ia', 'engines.title', 'profile.aiHint', PlugZap],
              ['/perfil/dispositivos', 'sync.devices', 'profile.devicesHint', Laptop],
            ] as const).map(([path, label, hint, Icon]) => (
              <Link className="profile-tool" to={path} key={path}>
                <Icon size={19} aria-hidden />
                <span><strong>{t(label)}</strong><small>{t(hint)}</small></span>
                <ChevronRight size={16} aria-hidden />
              </Link>
            ))}
          </nav>
          {rawSettings === undefined ? <p role="status" className="hint">{t("ui.loadingPreferences")}</p> : <SettingsSection settings={settings} />}
        </section>
        <div className="profile-data">
          <section aria-labelledby="profile-weight">
            <h2 className="section-title" id="profile-weight">{t("perf.weightTitle")}</h2>
            <div className="card">
              <WeightChart points={entries} goalKg={settings.bodyWeightGoalKg} />
              <BodyWeightForm />
              <BodyWeightList entries={entriesDesc} />
            </div>
          </section>
          <section aria-labelledby="profile-backup">
            <h2 className="section-title" id="profile-backup">{t("perf.dataTitle")}</h2>
            <SeusDadosSection />
          </section>
          <section aria-labelledby="importar-historico">
            <h2 className="section-title" id="importar-historico" tabIndex={-1}>{t("perf.importTitle")}</h2>
            <ImportarAppSection />
          </section>
          <section aria-labelledby="profile-plan">
            <h2 className="section-title" id="profile-plan">{t("perf.shareTitle")}</h2>
            <CompartilharPlanoSection />
          </section>
        </div>
      </div>
    </>
  );
}
