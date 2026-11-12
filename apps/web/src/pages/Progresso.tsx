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
import { TrendingUp, Dumbbell, User, Users } from 'lucide-react';
import type { Exercise, MuscleGroup } from '@forja/core';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { Heatmap } from '../components/Heatmap';
import { MuscleMap } from '../components/MuscleMap';
import {
  computeSummary,
  computePRs,
  computeVolumeByMuscle,
  workoutDates,
} from '../lib/stats';

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
        </>
      )}
    </>
  );
}
