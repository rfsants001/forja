// Tela de Insights / Progresso — Fase 3.
// Rota: /progresso (wiring em App.tsx pelo orquestrador).
//
// Seções:
//   1. Seletor de período (30d / 90d / tudo)
//   2. Heatmap de atividade
//   3. Resumo (nº treinos, dias, volume)
//   4. Mapa muscular (volume por grupo)
//   5. PRs (top 1RM estimado por exercício)

import '../styles/progresso.css';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingUp, Dumbbell } from 'lucide-react';
import type { Exercise } from '@forja/core';
import { db } from '../db/db';
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

type Period = 30 | 90 | null; // null = todos

interface PeriodOption {
  label: string;
  value: Period;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: 'Tudo', value: null },
];

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
  // Formata volume: se >= 1000 mostra em "t" (toneladas), senão em kg
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
  const [period, setPeriod] = useState<Period>(30);

  // ---- dados reativos ----
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);

  const isLoading = workouts === undefined || exercises === undefined;

  // ---- mapa de exercícios ----
  const exerciseMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises ?? []) m.set(e.id, e);
    return m;
  }, [exercises]);

  // ---- métricas derivadas (recalculam quando workouts, exercises ou period mudam) ----
  const summary = useMemo(
    () => computeSummary(workouts ?? [], period),
    [workouts, period],
  );

  const heatmapDates = useMemo(
    () => workoutDates(workouts ?? [], null), // heatmap sempre mostra ~17 semanas cheias
    [workouts],
  );

  const volumeByMuscle = useMemo(
    () => computeVolumeByMuscle(workouts ?? [], exerciseMap, period),
    [workouts, exerciseMap, period],
  );

  const prs = useMemo(
    () => computePRs(workouts ?? [], exerciseMap, period).slice(0, MAX_PRS),
    [workouts, exerciseMap, period],
  );

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
                onClick={() => setPeriod(opt.value)}
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
            <div className="section-title" style={{ margin: '0 0 4px' }}>
              Músculos
            </div>
            <div className="prog-muscle-wrap">
              {volumeByMuscle.size === 0 ? (
                <p className="hint" style={{ textAlign: 'center', padding: '12px 0' }}>
                  Sem dados de volume neste período.
                </p>
              ) : (
                <MuscleMap volumeByMuscle={volumeByMuscle} />
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
