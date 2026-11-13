import '../styles/perfil.css';
import '../styles/print.css';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  User, Trash2, CheckCircle2, TrendingUp, Download, Upload,
  Database, ArrowDownToLine, Share2, Printer, FileInput,
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '@forja/core';
import type { Settings, BodyWeight } from '@forja/core';
import { db } from '../db/db';
import { updateSettings, addBodyWeight, deleteBodyWeight } from '../db/repo';
import { downloadBackup, importAll } from '../lib/backup';
import {
  parseFitNotes, parseStrong, parseHevy, parseAppleHealthWeight,
  applyImport,
} from '../lib/importers';
import type { ImportResult } from '../lib/importers';
import { downloadPlan, importPlan, printPlan } from '../lib/plan-share';

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  // "2024-11-10" → "10/11/24"
  const parts = iso.split('-');
  const y = parts[0] ?? '';
  const m = parts[1] ?? '';
  const d = parts[2] ?? '';
  return `${d}/${m}/${y.slice(2)}`;
}

// ---------------------------------------------------------------------------
// Hook de debounce para settings
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Gráfico de linha em SVG puro
// ---------------------------------------------------------------------------

interface WeightChartProps {
  points: BodyWeight[];
  goalKg?: number;
}

function WeightChart({ points, goalKg }: WeightChartProps) {
  // Precisamos de ao menos 2 pontos para traçar uma linha
  if (points.length < 2) {
    return (
      <p className="hint" style={{ textAlign: 'center', padding: '20px 0' }}>
        Registre ao menos 2 pesos pra ver a tendência.
      </p>
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
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="Gráfico de evolução de peso">
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
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(toISO(new Date()));
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(kg);
    if (isNaN(parsed) || parsed <= 0) return;
    setBusy(true);
    try {
      await addBodyWeight({ dateISO: date, kg: parsed });
      setKg('');
      setDate(toISO(new Date()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="bw-form" onSubmit={(e) => { void handleSubmit(e); }}>
      <div className="bw-field" style={{ maxWidth: 100 }}>
        <label htmlFor="bw-kg">Peso (kg)</label>
        <input
          id="bw-kg"
          className="bw-input"
          type="number"
          step="0.1"
          min="1"
          max="500"
          placeholder="80.5"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          required
        />
      </div>
      <div className="bw-field">
        <label htmlFor="bw-date">Data</label>
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
        Registrar
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Lista de registros de peso
// ---------------------------------------------------------------------------

function BodyWeightList({ entries }: { entries: BodyWeight[] }) {
  if (entries.length === 0) {
    return (
      <p className="hint" style={{ textAlign: 'center', padding: '12px 0' }}>
        Nenhum registro ainda.
      </p>
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
            aria-label={`Excluir registro de ${fmtDate(item.dateISO)}`}
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
type SettingKey = 'unit' | 'defaultRestSec' | 'theme' | 'weekStartsOn' | 'trackEffort' | 'bodyWeightGoalKg';

function SettingsSection({ settings }: { settings: Settings }) {
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

  // Debounce para campos numéricos
  const debouncedRestSec = useDebounce(restSec, 600);
  const debouncedGoalKg = useDebounce(goalKg, 600);

  // Referência para evitar gravar no mount
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) return;
    const parsed = parseInt(debouncedRestSec, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed !== settings.defaultRestSec) {
      void updateSettings({ defaultRestSec: parsed }).then(() => flashSaved('defaultRestSec'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRestSec]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (debouncedGoalKg === '') {
      if (settings.bodyWeightGoalKg !== undefined) {
        // Remove a meta
        void updateSettings({ bodyWeightGoalKg: undefined }).then(() => flashSaved('bodyWeightGoalKg'));
      }
      return;
    }
    const parsed = parseFloat(debouncedGoalKg);
    if (!isNaN(parsed) && parsed > 0 && parsed !== settings.bodyWeightGoalKg) {
      void updateSettings({ bodyWeightGoalKg: parsed }).then(() => flashSaved('bodyWeightGoalKg'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedGoalKg]);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  function flashSaved(key: SettingKey) {
    setSavedKey(key);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSavedKey(null), 2000);
  }

  // Aplica o tema no documento
  function applyTheme(theme: Settings['theme']) {
    document.documentElement.dataset['theme'] = theme === 'system' ? '' : theme;
  }

  // Aplica tema no mount conforme setting salva
  useEffect(() => {
    applyTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme]);

  async function handleUnit(unit: Settings['unit']) {
    await updateSettings({ unit });
    flashSaved('unit');
  }

  async function handleTheme(theme: Settings['theme']) {
    applyTheme(theme);
    await updateSettings({ theme });
    flashSaved('theme');
  }

  async function handleWeekStartsOn(day: 0 | 1) {
    await updateSettings({ weekStartsOn: day });
    flashSaved('weekStartsOn');
  }

  async function handleTrackEffort(val: boolean) {
    await updateSettings({ trackEffort: val });
    flashSaved('trackEffort');
  }

  function SavedBadge({ k }: { k: SettingKey }) {
    if (savedKey !== k) return null;
    return (
      <span className="save-badge">
        <CheckCircle2 size={12} />
        salvo
      </span>
    );
  }

  return (
    <div className="card">
      {/* Unidade */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">Unidade de peso</span>
        </div>
        <SavedBadge k="unit" />
        <div className="toggle-group">
          <button
            className={settings.unit === 'kg' ? 'active' : ''}
            onClick={() => { void handleUnit('kg'); }}
          >
            kg
          </button>
          <button
            className={settings.unit === 'lb' ? 'active' : ''}
            onClick={() => { void handleUnit('lb'); }}
          >
            lb
          </button>
        </div>
      </div>

      {/* Descanso padrão */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">Descanso padrão</span>
          <span className="sub">segundos entre séries</span>
        </div>
        <SavedBadge k="defaultRestSec" />
        <input
          className="setting-input"
          type="number"
          min="10"
          max="600"
          step="5"
          value={restSec}
          onChange={(e) => setRestSec(e.target.value)}
          aria-label="Descanso padrão em segundos"
        />
      </div>

      {/* Tema */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">Tema</span>
        </div>
        <SavedBadge k="theme" />
        <select
          className="setting-select"
          value={settings.theme}
          onChange={(e) => { void handleTheme(e.target.value as Settings['theme']); }}
          aria-label="Tema do aplicativo"
        >
          <option value="dark">Escuro</option>
          <option value="light">Claro</option>
          <option value="system">Sistema</option>
        </select>
      </div>

      {/* Início da semana */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">Semana começa em</span>
        </div>
        <SavedBadge k="weekStartsOn" />
        <div className="toggle-group">
          <button
            className={settings.weekStartsOn === 0 ? 'active' : ''}
            onClick={() => { void handleWeekStartsOn(0); }}
          >
            Dom
          </button>
          <button
            className={settings.weekStartsOn === 1 ? 'active' : ''}
            onClick={() => { void handleWeekStartsOn(1); }}
          >
            Seg
          </button>
        </div>
      </div>

      {/* Rastrear esforço */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">Registrar esforço</span>
          <span className="sub">RIR / RPE por série</span>
        </div>
        <SavedBadge k="trackEffort" />
        <div className="toggle-group">
          <button
            className={settings.trackEffort ? 'active' : ''}
            onClick={() => { void handleTrackEffort(true); }}
          >
            Ligado
          </button>
          <button
            className={!settings.trackEffort ? 'active' : ''}
            onClick={() => { void handleTrackEffort(false); }}
          >
            Desligado
          </button>
        </div>
      </div>

      {/* Meta de peso */}
      <div className="setting-row">
        <div className="setting-label">
          <span className="lbl">Meta de peso</span>
          <span className="sub">kg (opcional)</span>
        </div>
        <SavedBadge k="bodyWeightGoalKg" />
        <input
          className="setting-input"
          type="number"
          min="1"
          max="500"
          step="0.5"
          placeholder="—"
          value={goalKg}
          onChange={(e) => setGoalKg(e.target.value)}
          aria-label="Meta de peso corporal em kg"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seção de dados (export/import)
// ---------------------------------------------------------------------------

function SeusDadosSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string, type: 'ok' | 'error') {
    setFeedback(msg);
    setStatus(type);
    window.setTimeout(() => {
      setFeedback(null);
      setStatus('idle');
    }, 4000);
  }

  async function handleExport() {
    setStatus('busy');
    try {
      await downloadBackup();
      showFeedback('Backup exportado com sucesso!', 'ok');
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Erro ao exportar.',
        'error',
      );
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limpa o input para permitir re-importar o mesmo arquivo
    e.target.value = '';

    const mode = window.confirm(
      'Substituir todos os dados locais pelo backup?\n\n' +
      'OK = Substituir (apaga tudo e importa o arquivo)\n' +
      'Cancelar = Mesclar (mantém os dados atuais e adiciona/atualiza pelo backup)',
    )
      ? 'replace'
      : 'merge';

    setStatus('busy');
    try {
      const json = await file.text();
      const result = await importAll(json, mode);

      const linhas = Object.entries(result.counts)
        .map(([tabela, n]) => `${tabela}: ${n}`)
        .join(', ');
      showFeedback(
        `Importado (${mode === 'replace' ? 'substituição' : 'mesclagem'}): ${linhas}`,
        'ok',
      );
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Erro ao importar.',
        'error',
      );
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Database size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <p className="hint" style={{ lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>Local-first:</strong> seus dados ficam
          neste aparelho, sem passar por servidores. Exporte um backup JSON para guardar
          ou transferir para outro dispositivo.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {/* Exportar */}
        <button
          className="btn"
          disabled={status === 'busy'}
          onClick={() => { void handleExport(); }}
          style={{ flex: '1 1 auto' }}
        >
          <Download size={15} />
          Exportar backup
        </button>

        {/* Importar — input oculto disparado pelo botão ghost */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => { void handleFileChange(e); }}
        />
        <button
          className="btn ghost"
          disabled={status === 'busy'}
          onClick={() => fileInputRef.current?.click()}
          style={{ flex: '1 1 auto' }}
        >
          <Upload size={15} />
          Importar backup
        </button>
      </div>

      {/* Aviso sobre replace */}
      <p className="hint" style={{ marginTop: 10 }}>
        Na importação, você escolhe entre <em>substituir</em> (apaga os dados atuais)
        ou <em>mesclar</em> (sobrescreve apenas os itens em conflito).
      </p>

      {/* Feedback */}
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

      setPreview({
        workouts: result.workouts.length,
        exercises: result.exercises.length,
        bodyweight: result.bodyweight.length,
        unrecognized: result.unrecognized,
        result,
      });
      setStatus('preview');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao processar o arquivo.');
    }
  }

  async function handleConfirm() {
    if (preview === null) return;
    setApplying(true);
    setStatus('applying');
    try {
      const counts = await applyImport(preview.result);
      setFeedback(
        `Importado: ${counts.workouts} treino(s), ${counts.exercises} exercício(s) novo(s)` +
        (counts.bodyweight > 0 ? `, ${counts.bodyweight} registro(s) de peso` : '') +
        '.',
      );
      setStatus('done');
      setPreview(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao gravar os dados.');
    } finally {
      setApplying(false);
    }
  }

  const currentSource = sourceOptions.find((s) => s.value === source);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <FileInput size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <p className="hint" style={{ lineHeight: 1.5 }}>
          Importe treinos de outros apps. Exercícios não reconhecidos são criados como personalizados
          — nenhum dado é descartado.
        </p>
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
            {status === 'parsing' ? 'Processando…' : `Selecionar arquivo ${currentSource?.label ?? ''}`}
          </button>
        </>
      )}

      {/* Preview */}
      {status === 'preview' && preview !== null && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Prévia da importação</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <li><span style={{ color: 'var(--text-muted)' }}>Treinos:</span> <strong>{preview.workouts}</strong></li>
            <li><span style={{ color: 'var(--text-muted)' }}>Exercícios novos:</span> <strong>{preview.exercises}</strong></li>
            {preview.bodyweight > 0 && (
              <li><span style={{ color: 'var(--text-muted)' }}>Pesos:</span> <strong>{preview.bodyweight}</strong></li>
            )}
            {preview.unrecognized.length > 0 && (
              <li style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Exercícios não reconhecidos (serão criados como personalizados):</span>
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
              {applying ? 'Gravando…' : 'Confirmar importação'}
            </button>
            <button className="btn ghost" onClick={resetState}>
              Cancelar
            </button>
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
        <button className="btn ghost" style={{ marginTop: 10, width: '100%' }} onClick={resetState}>
          Importar outro arquivo
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seção G6 — Compartilhar plano
// ---------------------------------------------------------------------------

function CompartilharPlanoSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string, type: 'ok' | 'error') {
    setFeedback(msg);
    setStatus(type);
    window.setTimeout(() => { setFeedback(null); setStatus('idle'); }, 4000);
  }

  async function handleExport() {
    setStatus('busy');
    try {
      await downloadPlan();
      showFeedback('Plano exportado com sucesso!', 'ok');
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Erro ao exportar.', 'error');
    }
  }

  async function handlePrint() {
    setStatus('busy');
    try {
      await printPlan();
      setStatus('idle');
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Erro ao abrir impressão.', 'error');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setStatus('busy');
    try {
      const json = await file.text();
      const counts = await importPlan(json);
      showFeedback(
        `Plano importado: ${counts.categories} categoria(s), ${counts.routines} rotina(s), ${counts.weekPlan} dia(s).`,
        'ok',
      );
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Erro ao importar.', 'error');
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Share2 size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <p className="hint" style={{ lineHeight: 1.5 }}>
          Compartilhe suas rotinas e plano semanal — sem histórico de treinos ou dados de peso.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn"
          style={{ flex: '1 1 auto' }}
          disabled={status === 'busy'}
          onClick={() => { void handleExport(); }}
        >
          <Download size={15} />
          Exportar plano
        </button>

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
          <Upload size={15} />
          Importar plano
        </button>

        <button
          className="btn ghost"
          style={{ flex: '1 1 auto' }}
          disabled={status === 'busy'}
          onClick={() => { void handlePrint(); }}
        >
          <Printer size={15} />
          Imprimir / PDF
        </button>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Na impressão, o browser abre uma janela com o plano formatado — salve como PDF pelo
        diálogo nativo (<em>Ctrl+P</em> ou <em>Cmd+P</em>).
      </p>

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
            Per<em>fil</em>
          </h1>
        </div>
      </div>

      {/* Seção 1 — Configurações */}
      <div className="section-title perfil-section">Configurações</div>
      {rawSettings !== undefined ? (
        <SettingsSection settings={settings} />
      ) : (
        // Loading — usa defaults enquanto o Dexie responde
        <SettingsSection settings={{ ...DEFAULT_SETTINGS }} />
      )}

      {/* Seção 2 — Peso corporal */}
      <div className="section-title perfil-section">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={15} style={{ opacity: 0.7 }} />
          Peso corporal
        </span>
      </div>
      <div className="card">
        <BodyWeightForm />
        <BodyWeightList entries={entriesDesc} />
      </div>

      {/* Seção 3 — Gráfico */}
      <div className="section-title">Evolução do peso</div>
      <div className="card">
        <WeightChart
          points={entries}
          goalKg={settings.bodyWeightGoalKg}
        />
      </div>

      {/* Seção 4 — Seus dados */}
      <div className="section-title perfil-section">Seus dados</div>
      <SeusDadosSection />

      {/* Seção 5 — Importar de outro app (G5) */}
      <div className="section-title perfil-section">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileInput size={15} style={{ opacity: 0.7 }} />
          Importar de outro app
        </span>
      </div>
      <ImportarAppSection />

      {/* Seção 6 — Compartilhar plano (G6) */}
      <div className="section-title perfil-section">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Share2 size={15} style={{ opacity: 0.7 }} />
          Compartilhar plano
        </span>
      </div>
      <CompartilharPlanoSection />

      <p className="hint" style={{ textAlign: 'center', marginTop: 24 }}>
        Login por passkey e sync entre dispositivos chegam na Fase 6.
      </p>
    </>
  );
}
