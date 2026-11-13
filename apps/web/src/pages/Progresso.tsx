// Tela de Insights / Progresso — Fase 3.
// Rota: /progresso (wiring em App.tsx pelo orquestrador).
//
// Seções:
//   1. Seletor de período (7d / 30d / tudo)
//   2. Heatmap de atividade
//   3. Resumo (nº treinos, dias, volume)
//   4. Mapa muscular (volume por grupo) + toggle figura + painel de não treinados
//   5. PRs (top 1RM estimado por exercício)

import '../styles/progresso.css';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingUp, Dumbbell, User, Users, Zap } from 'lucide-react';
import type { Exercise, MuscleGroup, WorkoutLog } from '@forja/core';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { Heatmap } from '../components/Heatmap';
import { MuscleMap } from '../components/MuscleMap';
import {
  computeSummary,
  computePRs,
  computeVolumeByMuscle,
  workoutDates,
  effortByWeek,
  effortSpread,
  topSetEffortCurve,
} from '../lib/stats';
import type { EffortWeek, TopSetPoint } from '../lib/stats';

// ---------------------------------------------------------------------------
// Tipos e constantes
// ---------------------------------------------------------------------------

/** Janela temporal em dias. null = histórico completo. */
type Period = 7 | 30 | null;

interface PeriodOption {
  label: string;
  value: Period;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: 'Tudo', value: null },
];

// Chave localStorage para persistir a janela selecionada
const PERIOD_STORAGE_KEY = 'forja:progresso:period';

function loadPeriod(): Period {
  try {
    const raw = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (raw === 'null') return null;
    const n = Number(raw);
    if (n === 7 || n === 30) return n;
  } catch {
    // ignore
  }
  return 30;
}

function savePeriod(p: Period): void {
  try {
    localStorage.setItem(PERIOD_STORAGE_KEY, String(p));
  } catch {
    // ignore
  }
}

// Número máximo de PRs exibidos na lista
const MAX_PRS = 10;

// ---------------------------------------------------------------------------
// Sub-componente: resumo em 3 colunas
// ---------------------------------------------------------------------------

interface SummaryGridProps {
  workoutCount: number;
  daysCount: number;
  totalVolume: number;
}

function SummaryGrid({ workoutCount, daysCount, totalVolume }: SummaryGridProps) {
  const volumeStr = useMemo(() => {
    if (totalVolume >= 1000) {
      return `${(totalVolume / 1000).toFixed(1)}t`;
    }
    return `${Math.round(totalVolume).toLocaleString('pt-BR')}`;
  }, [totalVolume]);

  const volumeUnit = totalVolume >= 1000 ? '' : 'kg';

  return (
    <div className="prog-summary-grid">
      <div className="prog-stat">
        <div className="prog-stat-value">{workoutCount}</div>
        <div className="prog-stat-label">treinos</div>
      </div>
      <div className="prog-stat">
        <div className="prog-stat-value">{daysCount}</div>
        <div className="prog-stat-label">dias</div>
      </div>
      <div className="prog-stat">
        <div className="prog-stat-value">
          {volumeStr}
          {volumeUnit !== '' && (
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>
              {' '}{volumeUnit}
            </span>
          )}
        </div>
        <div className="prog-stat-label">volume</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: gráfico de linha da média semanal de esforço (SVG puro)
// ---------------------------------------------------------------------------

const CHART_H = 72;
const CHART_MIN_W = 240;

interface EffortLineChartProps {
  weeks: EffortWeek[];
}

function EffortLineChart({ weeks }: EffortLineChartProps) {
  if (weeks.length === 0) return null;

  const W_PER_POINT = 44;
  const PAD_LEFT = 28;
  const PAD_RIGHT = 12;
  const PAD_TOP = 8;
  const PAD_BOT = 20;
  const innerH = CHART_H - PAD_TOP - PAD_BOT;

  const totalPoints = weeks.length;
  const svgW = Math.max(CHART_MIN_W, PAD_LEFT + PAD_RIGHT + totalPoints * W_PER_POINT);

  // Escala Y: RPE 0–10
  const yScale = (rpe: number) => PAD_TOP + innerH * (1 - rpe / 10);
  // Escala X: distribui pontos uniformemente
  const xScale = (i: number) =>
    PAD_LEFT + (totalPoints === 1 ? (svgW - PAD_LEFT - PAD_RIGHT) / 2 : (i / (totalPoints - 1)) * (svgW - PAD_LEFT - PAD_RIGHT));

  // Polyline path
  const points = weeks.map((w, i) => `${xScale(i).toFixed(1)},${yScale(w.avg).toFixed(1)}`).join(' ');

  // Grade Y em 2.5, 5, 7.5
  const gridLines = [2.5, 5, 7.5];

  // Formato semana curto: semana/mês
  function fmtWeek(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  return (
    <svg
      className="prog-effort-svg"
      width={svgW}
      height={CHART_H}
      aria-label="Média semanal de esforço (RPE)"
      role="img"
    >
      {/* Grade */}
      {gridLines.map((v) => (
        <line
          key={v}
          x1={PAD_LEFT}
          x2={svgW - PAD_RIGHT}
          y1={yScale(v)}
          y2={yScale(v)}
          stroke="var(--border-soft)"
          strokeWidth={1}
        />
      ))}

      {/* Rótulos Y */}
      {gridLines.map((v) => (
        <text
          key={v}
          x={PAD_LEFT - 5}
          y={yScale(v) + 4}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-muted)"
        >
          {v}
        </text>
      ))}

      {/* Linha */}
      {totalPoints > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="var(--flame)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Pontos e rótulos X */}
      {weeks.map((w, i) => {
        const cx = xScale(i);
        const cy = yScale(w.avg);
        return (
          <g key={w.weekISO}>
            <circle cx={cx} cy={cy} r={3.5} fill="var(--flame)" />
            {/* Tooltip value acima do ponto */}
            <text
              x={cx}
              y={cy - 7}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill="var(--flame-2)"
            >
              {w.avg}
            </text>
            {/* Rótulo X embaixo */}
            {(totalPoints <= 8 || i % Math.ceil(totalPoints / 8) === 0) && (
              <text
                x={cx}
                y={CHART_H - 4}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-muted)"
              >
                {fmtWeek(w.weekISO)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: barras de spread (distribuição por nível RPE)
// ---------------------------------------------------------------------------

interface EffortSpreadBarsProps {
  spread: Record<number, number>;
}

function EffortSpreadBars({ spread }: EffortSpreadBarsProps) {
  const entries = Object.entries(spread)
    .map(([k, v]) => ({ level: Number(k), count: v }))
    .sort((a, b) => a.level - b.level);

  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map((e) => e.count));

  return (
    <div className="prog-effort-spread">
      <div className="prog-effort-spread-title">Distribuição (RPE)</div>
      <div className="prog-effort-bars">
        {entries.map(({ level, count }) => (
          <div key={level} className="prog-effort-bar-row">
            <div className="prog-effort-bar-label">{level}</div>
            <div className="prog-effort-bar-track">
              <div
                className="prog-effort-bar-fill"
                style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
              />
            </div>
            <div className="prog-effort-bar-count">{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: curva do top-set (SVG puro) com seletor de exercício
// ---------------------------------------------------------------------------

interface TopSetCurveProps {
  points: TopSetPoint[];
}

function TopSetCurve({ points }: TopSetCurveProps) {
  if (points.length < 2) {
    return (
      <p className="hint" style={{ textAlign: 'center', padding: '4px 0' }}>
        São necessárias ao menos 2 sessões para exibir a curva.
      </p>
    );
  }

  const W_PER_POINT = 44;
  const PAD_LEFT = 36;
  const PAD_RIGHT = 12;
  const PAD_TOP = 8;
  const PAD_BOT = 20;
  const SVG_H = 80;
  const innerH = SVG_H - PAD_TOP - PAD_BOT;

  const totalPoints = points.length;
  const svgW = Math.max(CHART_MIN_W, PAD_LEFT + PAD_RIGHT + totalPoints * W_PER_POINT);

  const rms = points.map((p) => p.topSet1RM);
  const minRM = Math.min(...rms);
  const maxRM = Math.max(...rms);
  const rangeRM = maxRM - minRM || 1;

  const yScaleRM = (rm: number) => PAD_TOP + innerH * (1 - (rm - minRM) / rangeRM);
  const xScale = (i: number) =>
    PAD_LEFT + (totalPoints === 1 ? (svgW - PAD_LEFT - PAD_RIGHT) / 2 : (i / (totalPoints - 1)) * (svgW - PAD_LEFT - PAD_RIGHT));

  // Escala de esforço para raio do círculo: RPE 6=r3, 10=r6
  const effortRadius = (e: number | undefined): number => {
    if (e === undefined) return 3.5;
    return 3 + (e / 10) * 3;
  };

  const linePoints = points
    .map((p, i) => `${xScale(i).toFixed(1)},${yScaleRM(p.topSet1RM).toFixed(1)}`)
    .join(' ');

  function fmtDate(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <svg
        width={svgW}
        height={SVG_H}
        aria-label="Curva do top-set com esforço"
        role="img"
      >
        {/* Linha do 1RM */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--flame)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="4 2"
        />

        {/* Pontos: raio proporcional ao esforço */}
        {points.map((p, i) => {
          const cx = xScale(i);
          const cy = yScaleRM(p.topSet1RM);
          const r = effortRadius(p.effort);
          const hasEffort = p.effort !== undefined;
          return (
            <g key={p.dateISO}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={hasEffort ? 'var(--flame)' : 'var(--surface-2)'}
                stroke="var(--flame)"
                strokeWidth={1.5}
              />
              {/* Rótulo 1RM */}
              <text
                x={cx}
                y={cy - r - 4}
                textAnchor="middle"
                fontSize={9}
                fill="var(--flame-2)"
                fontWeight={600}
              >
                {p.topSet1RM}
              </text>
              {/* Rótulo data */}
              {(totalPoints <= 8 || i % Math.ceil(totalPoints / 8) === 0) && (
                <text
                  x={cx}
                  y={SVG_H - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {fmtDate(p.dateISO)}
                </text>
              )}
            </g>
          );
        })}

        {/* Rótulo Y mín/máx */}
        <text
          x={PAD_LEFT - 4}
          y={PAD_TOP + 4}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-muted)"
        >
          {maxRM}
        </text>
        <text
          x={PAD_LEFT - 4}
          y={PAD_TOP + innerH + 4}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-muted)"
        >
          {minRM}
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: seção completa de esforço
// ---------------------------------------------------------------------------

interface EffortSectionProps {
  workouts: WorkoutLog[];
  exerciseMap: Map<string, Exercise>;
  period: Period;
  trackEffort: boolean;
}

function EffortSection({ workouts, exerciseMap, period, trackEffort }: EffortSectionProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');

  // Calcula semanas e spread para o período selecionado
  const weeks = useMemo(() => effortByWeek(workouts, period), [workouts, period]);
  const spread = useMemo(() => effortSpread(workouts, period), [workouts, period]);

  // Exercícios que têm ao menos um set com esforço (em todo o histórico, sem filtro de período)
  const exercisesWithEffort = useMemo(() => {
    const ids = new Set<string>();
    for (const w of workouts) {
      for (const entry of w.entries) {
        for (const set of entry.sets) {
          if (set.done && set.effort !== undefined) {
            ids.add(entry.exerciseId);
          }
        }
      }
    }
    return Array.from(ids).map((id) => ({
      id,
      name: exerciseMap.get(id)?.name ?? `Exercício ${id}`,
    })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [workouts, exerciseMap]);

  // Seleciona automaticamente o primeiro quando a lista muda
  const resolvedExerciseId = selectedExerciseId !== '' && exercisesWithEffort.some((e) => e.id === selectedExerciseId)
    ? selectedExerciseId
    : (exercisesWithEffort[0]?.id ?? '');

  const curvePoints = useMemo(
    () => resolvedExerciseId !== '' ? topSetEffortCurve(workouts, resolvedExerciseId) : [],
    [workouts, resolvedExerciseId],
  );

  const hasData = weeks.length > 0;
  const totalSets = weeks.reduce((acc, w) => acc + w.setCount, 0);

  // Se não há dados e trackEffort está desligado, mostra dica
  if (!hasData && !trackEffort) {
    return (
      <div className="card" style={{ marginBottom: 'var(--gap)' }}>
        <div className="prog-effort-header">
          <Zap size={15} strokeWidth={2.2} style={{ color: 'var(--flame)' }} />
          <div className="section-title">Esforço</div>
        </div>
        <div className="prog-effort-hint">
          <p className="hint">Registro de esforço (RIR/RPE) desativado.</p>
          <p className="hint">Ative em <strong>Perfil → Registrar esforço</strong> para ver estatísticas aqui.</p>
        </div>
      </div>
    );
  }

  // Se trackEffort está ligado mas não há dados ainda
  if (!hasData) {
    return (
      <div className="card" style={{ marginBottom: 'var(--gap)' }}>
        <div className="prog-effort-header">
          <Zap size={15} strokeWidth={2.2} style={{ color: 'var(--flame)' }} />
          <div className="section-title">Esforço</div>
        </div>
        <p className="hint" style={{ textAlign: 'center', padding: '8px 0' }}>
          Nenhum dado de esforço neste período.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--gap)' }}>
      <div className="prog-effort-header">
        <Zap size={15} strokeWidth={2.2} style={{ color: 'var(--flame)' }} />
        <div className="section-title">Esforço</div>
      </div>

      {/* Média semanal — gráfico de linha */}
      <div className="prog-effort-meta">
        {totalSets} set{totalSets !== 1 ? 's' : ''} avaliado{totalSets !== 1 ? 's' : ''} · escala RPE 0–10
      </div>
      <div className="prog-effort-chart">
        <EffortLineChart weeks={weeks} />
      </div>

      <div className="prog-effort-divider" />

      {/* Spread */}
      <EffortSpreadBars spread={spread} />

      {/* Curva do top-set */}
      {exercisesWithEffort.length > 0 && (
        <div className="prog-effort-curve">
          <div className="prog-effort-curve-header">
            <div className="prog-effort-curve-title">Top-set + esforço</div>
            <select
              className="prog-effort-curve-select"
              value={resolvedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              aria-label="Selecionar exercício para curva do top-set"
            >
              {exercisesWithEffort.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
          <TopSetCurve points={curvePoints} />
          <p className="hint" style={{ marginTop: 6, fontSize: 10 }}>
            Círculo maior = RPE mais alto naquela sessão. Contorno vazio = sem esforço registrado.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function Progresso() {
  const [period, setPeriod] = useState<Period>(loadPeriod);

  // ---- dados reativos ----
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  // Settings para figura do mapa muscular
  const settings = useLiveQuery(() => db.settings.get('app'), []);

  const isLoading = workouts === undefined || exercises === undefined;

  // Figura persistida em Settings (padrão 'male')
  const figure = settings?.muscleFigure ?? 'male';
  // Rastreio de esforço habilitado nas configurações
  const trackEffort = settings?.trackEffort ?? false;

  // ---- mapa de exercícios ----
  const exerciseMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises ?? []) m.set(e.id, e);
    return m;
  }, [exercises]);

  // ---- métricas derivadas ----
  const summary = useMemo(
    () => computeSummary(workouts ?? [], period),
    [workouts, period],
  );

  const heatmapDates = useMemo(
    () => workoutDates(workouts ?? [], null),
    [workouts],
  );

  const volumeByMuscleMap = useMemo(
    () => computeVolumeByMuscle(workouts ?? [], exerciseMap, period),
    [workouts, exerciseMap, period],
  );

  // Converte Map→Partial<Record> para o MuscleMap atualizado
  const volumeByMuscle = useMemo(() => {
    const rec: Partial<Record<MuscleGroup, number>> = {};
    for (const [k, v] of volumeByMuscleMap) {
      rec[k] = v;
    }
    return rec;
  }, [volumeByMuscleMap]);

  const prs = useMemo(
    () => computePRs(workouts ?? [], exerciseMap, period).slice(0, MAX_PRS),
    [workouts, exerciseMap, period],
  );

  // ---- handlers ----
  function handlePeriod(p: Period) {
    setPeriod(p);
    savePeriod(p);
  }

  async function handleFigureToggle() {
    const next = figure === 'male' ? 'female' : 'male';
    await repo.updateSettings({ muscleFigure: next });
  }

  function handleUntrainedClick(muscle: MuscleGroup) {
    // Deep link para biblioteca filtrada por músculo
    window.location.hash = `#/biblioteca?muscle=${muscle}`;
  }

  // ---- render ----
  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <span className="mark">
            <TrendingUp size={20} strokeWidth={2.4} />
          </span>
          <h1>Progresso</h1>
        </div>
      </div>

      {/* Estado de carregamento */}
      {isLoading && (
        <p className="hint" style={{ textAlign: 'center', marginTop: 32 }}>
          Carregando…
        </p>
      )}

      {/* Estado vazio */}
      {!isLoading && workouts.length === 0 && (
        <div className="empty">
          <div className="prog-empty-icon">
            <Dumbbell size={48} strokeWidth={1.3} />
          </div>
          <p>Nenhum treino registrado ainda.</p>
          <p className="hint" style={{ marginTop: 6 }}>
            Conclua seu primeiro treino para ver os insights aqui.
          </p>
        </div>
      )}

      {/* Conteúdo principal */}
      {!isLoading && workouts.length > 0 && (
        <>
          {/* Seletor de período */}
          <div className="prog-period-bar">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                className={`prog-period-btn${period === opt.value ? ' active' : ''}`}
                onClick={() => handlePeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Heatmap */}
          <div className="card" style={{ marginBottom: 'var(--gap)' }}>
            <div className="section-title" style={{ margin: '0 0 12px' }}>
              Atividade
            </div>
            <div className="prog-heatmap-wrap">
              <Heatmap dates={heatmapDates} />
            </div>
          </div>

          {/* Resumo */}
          <div className="card" style={{ marginBottom: 'var(--gap)' }}>
            <div className="section-title" style={{ margin: '0 0 8px' }}>
              Resumo
            </div>
            <SummaryGrid
              workoutCount={summary.workoutCount}
              daysCount={summary.daysCount}
              totalVolume={summary.totalVolume}
            />
          </div>

          {/* Mapa muscular */}
          <div className="card" style={{ marginBottom: 'var(--gap)' }}>
            <div className="prog-muscle-header">
              <div className="section-title">Músculos</div>
              {/* Toggle figura masculina/feminina */}
              <button
                className={`prog-figure-btn${figure === 'female' ? ' active' : ''}`}
                onClick={() => void handleFigureToggle()}
                title={figure === 'male' ? 'Mudar para figura feminina' : 'Mudar para figura masculina'}
                aria-label="Alternar figura do mapa muscular"
              >
                {figure === 'male' ? (
                  <>
                    <User size={13} strokeWidth={2.2} />
                    <span>M</span>
                  </>
                ) : (
                  <>
                    <Users size={13} strokeWidth={2.2} />
                    <span>F</span>
                  </>
                )}
              </button>
            </div>
            <div className="prog-muscle-wrap">
              {volumeByMuscleMap.size === 0 ? (
                <p className="hint" style={{ textAlign: 'center', padding: '12px 0' }}>
                  Sem dados de volume neste período.
                </p>
              ) : (
                <MuscleMap
                  volumeByMuscle={volumeByMuscle}
                  figure={figure}
                  showUntrained
                  onUntrainedClick={handleUntrainedClick}
                />
              )}
            </div>
          </div>

          {/* PRs */}
          <div className="card" style={{ marginBottom: 'var(--gap)' }}>
            <div className="section-title" style={{ margin: '0 0 8px' }}>
              Recordes (1RM est.)
            </div>
            {prs.length === 0 ? (
              <p className="hint" style={{ textAlign: 'center', padding: '8px 0' }}>
                Nenhum PR com carga registrado neste período.
              </p>
            ) : (
              <div className="prog-pr-list">
                {prs.map((pr, idx) => (
                  <div key={pr.exerciseId} className="prog-pr-item">
                    <div className={`prog-pr-rank${idx < 3 ? ' top' : ''}`}>
                      {idx + 1}
                    </div>
                    <div className="prog-pr-info">
                      <div className="prog-pr-name">{pr.exerciseName}</div>
                      <div className="prog-pr-detail">
                        {pr.repsAtBest} rep{pr.repsAtBest !== 1 ? 's' : ''} @ {pr.bestWeightKg} kg
                      </div>
                    </div>
                    <div className="prog-pr-rm">
                      {pr.best1RM}
                      <span> kg</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Esforço (G4) */}
          <EffortSection
            workouts={workouts}
            exerciseMap={exerciseMap}
            period={period}
            trackEffort={trackEffort}
          />
        </>
      )}
    </>
  );
}
