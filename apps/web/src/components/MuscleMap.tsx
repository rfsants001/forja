// Mapa muscular simplificado — SVG próprio (frente + costas lado a lado).
// Regiões são interpoladas de --surface-2 (sem volume) até --flame (máximo).
// Sem dependência de asset externo.
//
// Props principais:
//   volumeByMuscle  — Partial<Record<MuscleGroup, number>> (Σ reps×kg ou ratio normalizado)
//   figure          — 'male' | 'female' (default 'male') — troca o outline
//   preview         — quando true, usa destaque binário "acerta/não acerta" em vez de heatmap
//   showUntrained   — quando true, exibe painel de músculos com volume 0 (modo stats)
//   onUntrainedClick — callback ao clicar num grupo não treinado (deep link p/ biblioteca)

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MuscleGroup } from '@forja/core';
import { MUSCLE_LABEL } from '../lib/labels';
import {
  MUSCLE_REGIONS,
  bodyOutline,
} from '../lib/muscle-map-paths';

// ---------------------------------------------------------------------------
// Grupos excluídos da lista de "não treinados" (não representáveis no mapa de força)
// ---------------------------------------------------------------------------

const IGNORED_FOR_UNTRAINED = new Set<MuscleGroup>(['fullbody', 'cardio', 'other']);

// ---------------------------------------------------------------------------
// Helpers de cor
// ---------------------------------------------------------------------------

/**
 * Heatmap: interpola entre --surface-2 (cinza escuro) e --flame (laranja) conforme ratio [0,1].
 * Usa uma escala com 5 stops para controle fino.
 */
function muscleColor(ratio: number): string {
  if (ratio <= 0) return 'var(--surface-2)';
  if (ratio < 0.2) return 'rgba(255, 122, 26, 0.20)';
  if (ratio < 0.4) return 'rgba(255, 122, 26, 0.40)';
  if (ratio < 0.65) return 'rgba(255, 122, 26, 0.62)';
  if (ratio < 0.85) return 'rgba(255, 122, 26, 0.82)';
  return 'var(--flame)';
}

/**
 * Preview: destaque binário — acerta (laranja vivo) vs não acerta (surface-2).
 */
function previewColor(ratio: number): string {
  return ratio > 0 ? 'rgba(255, 122, 26, 0.75)' : 'var(--surface-2)';
}

// ---------------------------------------------------------------------------
// Legenda
// ---------------------------------------------------------------------------

const LEGEND_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

function Legend() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        marginTop: 10,
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>
        menos
      </span>
      {LEGEND_STEPS.map((r) => (
        <span
          key={r}
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: muscleColor(r),
            display: 'inline-block',
            border: '1px solid var(--border-soft)',
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>
        mais
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de músculos não treinados
// ---------------------------------------------------------------------------

interface UntrainedPanelProps {
  groups: MuscleGroup[];
  onUntrainedClick?: (muscle: MuscleGroup) => void;
}

function UntrainedPanel({ groups, onUntrainedClick }: UntrainedPanelProps) {
  if (groups.length === 0) return null;

  return (
    <div className="muscle-untrained-panel">
      <div className="muscle-untrained-header">
        <AlertTriangle size={13} strokeWidth={2.2} />
        <span>Não treinou nesta janela</span>
      </div>
      <div className="muscle-untrained-list">
        {groups.map((g) => (
          <button
            key={g}
            className="muscle-untrained-tag"
            onClick={() => onUntrainedClick?.(g)}
            title={`Ver exercícios de ${MUSCLE_LABEL[g]}`}
          >
            {MUSCLE_LABEL[g]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props e componente principal
// ---------------------------------------------------------------------------

export interface MuscleMapProps {
  /**
   * Volume por MuscleGroup.
   * Modo stats: Σ reps×kg (normalizado internamente pelo máximo).
   * Modo preview: já deve estar em [0, 1] (use `previewVolumeByMuscle`).
   * Grupos ausentes têm volume 0.
   */
  volumeByMuscle: Partial<Record<MuscleGroup, number>>;
  /**
   * Figura da silhueta. Padrão: 'male'.
   * 'female' usa outline com ombros mais estreitos e quadril mais largo.
   */
  figure?: 'male' | 'female';
  /**
   * Quando true, exibe destaque binário em vez de heatmap de intensidade.
   * Usado no editor de rotina para mostrar "quais músculos a rotina atinge".
   */
  preview?: boolean;
  /**
   * Quando true, exibe painel listando grupos sem volume no período.
   * Recomendado apenas no modo stats (não no preview da rotina).
   */
  showUntrained?: boolean;
  /**
   * Callback ao clicar num grupo não treinado.
   * Recebe o MuscleGroup para que a tela pai possa abrir deep link (ex.: /biblioteca?muscle=…).
   */
  onUntrainedClick?: (muscle: MuscleGroup) => void;
}

type View = 'front' | 'back';

export function MuscleMap({
  volumeByMuscle,
  figure = 'male',
  preview = false,
  showUntrained = false,
  onUntrainedClick,
}: MuscleMapProps) {
  // Valor máximo para normalização (apenas no modo heatmap)
  const maxVolume = useMemo(() => {
    if (preview) return 1; // já normalizado
    let max = 0;
    for (const v of Object.values(volumeByMuscle)) {
      if (v !== undefined && v > max) max = v;
    }
    return max;
  }, [volumeByMuscle, preview]);

  /** Ratio normalizado [0,1] para um grupo muscular. */
  function ratio(muscle: MuscleGroup): number {
    const v = volumeByMuscle[muscle] ?? 0;
    if (preview) return v; // já [0,1]
    if (maxVolume === 0) return 0;
    return v / maxVolume;
  }

  /** Cor final baseada no modo. */
  function fillColor(muscle: MuscleGroup): string {
    const r = ratio(muscle);
    return preview ? previewColor(r) : muscleColor(r);
  }

  // Outlines (frente/costas) conforme figura
  const outlines = useMemo(() => bodyOutline(figure), [figure]);

  // Lista de grupos "não treinados" (apenas grupos que têm path no mapa)
  const untrainedGroups = useMemo<MuscleGroup[]>(() => {
    if (!showUntrained) return [];
    const withPaths = (Object.keys(MUSCLE_REGIONS) as MuscleGroup[]).filter(
      (g) => !IGNORED_FOR_UNTRAINED.has(g),
    );
    return withPaths.filter((g) => (volumeByMuscle[g] ?? 0) === 0);
  }, [showUntrained, volumeByMuscle]);

  // Renderiza os paths de um lado (front ou back)
  function renderSide(view: View) {
    return (
      <>
        {/* Silhueta de fundo */}
        <path
          d={view === 'front' ? outlines.front : outlines.back}
          fill="var(--surface-3)"
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* Regiões musculares */}
        {(Object.entries(MUSCLE_REGIONS) as [MuscleGroup, typeof MUSCLE_REGIONS[MuscleGroup]][]).map(
          ([muscle, region]) => {
            if (region === undefined) return null;
            const paths = view === 'front' ? region.front : region.back;
            if (paths === undefined || paths.length === 0) return null;
            const fill = fillColor(muscle);
            const vol = volumeByMuscle[muscle] ?? 0;

            return paths.map((d, i) => (
              <path
                key={`${muscle}-${view}-${i}`}
                d={d}
                fill={fill}
                opacity={0.9}
                style={{ transition: 'fill 0.3s ease' }}
              >
                <title>
                  {MUSCLE_LABEL[muscle]}
                  {vol > 0 && !preview
                    ? `: ${Math.round(vol).toLocaleString('pt-BR')} kg`
                    : vol > 0 && preview
                    ? ' ✓'
                    : ''}
                </title>
              </path>
            ));
          },
        )}
      </>
    );
  }

  // ---- layout: dois SVGs lado a lado ----
  const VB = '0 0 200 340';
  const svgStyle: React.CSSProperties = {
    width: '50%',
    maxWidth: 180,
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {/* Frente */}
        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Frente
          </span>
          <svg viewBox={VB} style={svgStyle} aria-label="Vista frontal dos músculos">
            {renderSide('front')}
          </svg>
        </div>

        {/* Costas */}
        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Costas
          </span>
          <svg viewBox={VB} style={svgStyle} aria-label="Vista posterior dos músculos">
            {renderSide('back')}
          </svg>
        </div>
      </div>

      {/* Legenda só no modo heatmap */}
      {!preview && <Legend />}

      {/* Painel de não treinados */}
      {showUntrained && (
        <UntrainedPanel groups={untrainedGroups} onUntrainedClick={onUntrainedClick} />
      )}
    </div>
  );
}
