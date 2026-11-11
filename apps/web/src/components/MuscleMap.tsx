// Mapa muscular simplificado — SVG próprio (frente + costas lado a lado).
// Regiões são interpoladas de --surface-2 (sem volume) até --flame (máximo).
// Sem dependência de asset externo.

import { useMemo } from 'react';
import type { MuscleGroup } from '@forja/core';
import { MUSCLE_LABEL } from '../lib/labels';
import {
  MUSCLE_REGIONS,
  BODY_OUTLINE_FRONT,
  BODY_OUTLINE_BACK,
} from '../lib/muscle-map-paths';

// ---------------------------------------------------------------------------
// Helpers de cor
// ---------------------------------------------------------------------------

/**
 * Interpola entre --surface-2 (cinza escuro) e --flame (laranja) conforme ratio [0,1].
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
// Props e componente principal
// ---------------------------------------------------------------------------

interface MuscleMapProps {
  /** Volume por MuscleGroup (Σ reps×kg). Grupos ausentes = 0. */
  volumeByMuscle: Map<MuscleGroup, number>;
}

type View = 'front' | 'back';

export function MuscleMap({ volumeByMuscle }: MuscleMapProps) {
  // Valor máximo para normalização
  const maxVolume = useMemo(() => {
    let max = 0;
    for (const v of volumeByMuscle.values()) {
      if (v > max) max = v;
    }
    return max;
  }, [volumeByMuscle]);

  /** Ratio normalizado [0,1] para um grupo muscular. */
  function ratio(muscle: MuscleGroup): number {
    if (maxVolume === 0) return 0;
    return (volumeByMuscle.get(muscle) ?? 0) / maxVolume;
  }

  // Renderiza os paths de um lado (front ou back)
  function renderSide(view: View) {
    return (
      <>
        {/* Silhueta de fundo */}
        <path
          d={view === 'front' ? BODY_OUTLINE_FRONT : BODY_OUTLINE_BACK}
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
            const r = ratio(muscle);
            const fill = muscleColor(r);
            const vol = volumeByMuscle.get(muscle) ?? 0;

            return paths.map((d, i) => (
              <path
                key={`${muscle}-${view}-${i}`}
                d={d}
                fill={fill}
                opacity={0.9}
                style={{ transition: 'fill 0.3s ease' }}
              >
                <title>
                  {MUSCLE_LABEL[muscle]}{vol > 0 ? `: ${Math.round(vol).toLocaleString('pt-BR')} kg` : ''}
                </title>
              </path>
            ));
          }
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

      <Legend />
    </div>
  );
}
