import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MuscleGroup } from '@forja/core';
import { MUSCLE_LABEL } from '../lib/labels';
import { useT } from '../lib/i18n';
import { MUSCLES_IN_ATLAS, MUSCLE_PATH_GROUPS, muscleGeometry } from '../lib/muscle-map-paths';
import type { MuscleFigure, MuscleView } from '../lib/muscle-map-paths';

/**
 * Heatmap: interpola entre --surface-2 (cinza escuro) e --flame (acento) conforme ratio [0,1].
 * Usa uma escala com 5 stops para controle fino.
 */
function muscleColor(ratio: number): string {
  if (ratio <= 0) return 'var(--surface-2)';
  if (ratio < 0.2) return 'color-mix(in srgb, var(--accent) 20%, var(--surface-2))';
  if (ratio < 0.4) return 'color-mix(in srgb, var(--accent) 40%, var(--surface-2))';
  if (ratio < 0.65) return 'color-mix(in srgb, var(--accent) 62%, var(--surface-2))';
  if (ratio < 0.85) return 'color-mix(in srgb, var(--accent) 82%, var(--surface-2))';
  return 'var(--flame)';
}

/**
 * Preview: destaque binário — acerta (acento) vs não acerta (surface-2).
 */
function previewColor(ratio: number): string {
  if (ratio >= 1) return 'var(--accent)';
  if (ratio > 0) return 'color-mix(in srgb, var(--accent) 48%, var(--surface-2))';
  return 'var(--muscle-unhighlighted, var(--surface-2))';
}

// ---------------------------------------------------------------------------
// Legenda
// ---------------------------------------------------------------------------

const LEGEND_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

function Legend() {
  const t = useT();
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
        {t('musclemap.less')}
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
        {t('musclemap.more')}
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
  const t = useT();
  if (groups.length === 0) return null;

  return (
    <div className="muscle-untrained-panel">
      <div className="muscle-untrained-header">
        <AlertTriangle size={13} strokeWidth={2.2} />
        <span>{t('musclemap.untrained')}</span>
      </div>
      <div className="muscle-untrained-list">
        {groups.map((g) => (
          <button
            key={g}
            className="muscle-untrained-tag"
            onClick={() => onUntrainedClick?.(g)}
            title={t('musclemap.seeExercises', [MUSCLE_LABEL[g]])}
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
  figure?: MuscleFigure;
  /**
   * Quando true, exibe destaque dos músculos primários e secundários.
   * Usado no editor de rotina para mostrar "quais músculos a rotina atinge".
   */
  preview?: boolean;
  metric?: 'sets' | 'volume';
  /**
   * Quando true, exibe painel listando grupos sem volume no período.
   * Recomendado apenas no modo stats (não no preview da rotina).
   */
  showUntrained?: boolean;
  trainedMuscles?: ReadonlySet<MuscleGroup>;
  /**
   * Callback ao clicar num grupo não treinado.
   * Recebe o MuscleGroup para que a tela pai possa abrir deep link (ex.: /biblioteca?muscle=…).
   */
  onUntrainedClick?: (muscle: MuscleGroup) => void;
}

export function MuscleMap({
  volumeByMuscle,
  figure = 'male',
  preview = false,
  metric = 'volume',
  showUntrained = false,
  onUntrainedClick,
  trainedMuscles,
}: MuscleMapProps) {
  const tMuscle = useT();
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

  const untrainedGroups = showUntrained
    ? MUSCLES_IN_ATLAS.filter((group) =>
        trainedMuscles ? !trainedMuscles.has(group) : (volumeByMuscle[group] ?? 0) === 0)
    : [];

  function renderSide(view: MuscleView) {
    const { viewBox, parts } = muscleGeometry(figure, view);
    return (
      <figure key={view}>
        <svg viewBox={viewBox} role="img" aria-label={tMuscle(view === 'front'
          ? 'musclemap.frontAriaLabel' : 'musclemap.backAriaLabel')}>
          {Object.entries(parts).map(([part, paths]) => {
            const group = MUSCLE_PATH_GROUPS[part];
            const volume = group ? volumeByMuscle[group] ?? 0 : 0;
            return (
              <g key={part} fill={group ? fillColor(group) : 'var(--muscle-unhighlighted, var(--surface-2))'}>
                {group && <title>{tMuscle(`muscle.${group}`)}{volume > 0 && !preview
                  ? ` · ${Math.round(volume).toLocaleString(document.documentElement.lang || 'pt-BR')} ${metric === 'sets' ? tMuscle('unit.sets') : 'kg'}`
                  : ''}</title>}
                {paths.map((path, index) => <path key={index} d={path} />)}
              </g>
            );
          })}
        </svg>
        <figcaption>{tMuscle(view === 'front' ? 'musclemap.front' : 'musclemap.back')}</figcaption>
      </figure>
    );
  }

  return (
    <div>
      <div className="muscle-atlas">
        {renderSide('front')}
        {renderSide('back')}
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
