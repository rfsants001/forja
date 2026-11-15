import type { MuscleGroup } from '@forja/core';
import { useT } from '../lib/i18n';
import { MUSCLES_IN_ATLAS, type MuscleFigure } from '../lib/muscle-map-paths';
import { MuscleMap } from './MuscleMap';

interface MuscleCoverageProps {
  figure?: MuscleFigure;
  primary: readonly MuscleGroup[];
  secondary: readonly MuscleGroup[];
}

/** Destaque anatômico por função do músculo, sem escala de intensidade. */
export function MuscleCoverage({ figure, primary, secondary }: MuscleCoverageProps) {
  const t = useT();
  const supporting = secondary.filter((group) => !primary.includes(group));
  const highlights = Object.fromEntries([
    ...supporting.map((group) => [group, 0.5]),
    ...primary.map((group) => [group, 1]),
  ]);

  return (
    <>
      {MUSCLES_IN_ATLAS.some((group) => group in highlights) && (
        <MuscleMap figure={figure} volumeByMuscle={highlights} preview />
      )}
      <ul className="exercise-muscle-legend">
        {primary.length > 0 && (
          <li>
            <span className="muscle-legend-swatch primary" aria-hidden="true" />
            <span><strong>{t(primary.length === 1 ? 'musclemap.primary' : 'musclemap.primaryPlural')}</strong> {primary.map((group) => t(`muscle.${group}`)).join(', ')}</span>
          </li>
        )}
        {supporting.length > 0 && (
          <li>
            <span className="muscle-legend-swatch secondary" aria-hidden="true" />
            <span><strong>{t('musclemap.secondary')}</strong> {supporting.map((group) => t(`muscle.${group}`)).join(', ')}</span>
          </li>
        )}
      </ul>
    </>
  );
}
