import { useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import type { DemoSource } from '@forja/core';
import { useT } from '../lib/i18n';
import catalog from '../data/exercise-media.json';
import './Media.css';

type MediaSize = 'sm' | 'md' | 'lg' | 'xl';

interface ExerciseMedia {
  frames: (number | string)[];
  author: string;
  license: number;
  source?: string[];
}

const demos: Readonly<Partial<Record<string, ExerciseMedia>>> = catalog;
const licenses: Record<number, { name: string; url: string }> = {
  1: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  2: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
};

export function hasExerciseMedia(exerciseId: string, demo: DemoSource): boolean {
  return demo.kind === 'custom' || Object.hasOwn(demos, exerciseId);
}

interface MediaProps {
  exerciseId?: string;
  demo: DemoSource;
  name: string;
  size?: MediaSize;
  staticOnly?: boolean;
}

export function Media({ exerciseId, demo, name, size = 'md', staticOnly = false }: MediaProps) {
  const local = exerciseId && Object.hasOwn(demos, exerciseId) ? demos[exerciseId] : undefined;

  if (local) return <DemoFrames key={exerciseId} entry={local} name={name} size={size} staticOnly={staticOnly} />;

  return (
    <div className="media-root" data-size={size}>
      {demo.kind === 'custom'
        ? <img src={`data:image/svg+xml,${encodeURIComponent(demo.svg)}`} alt={staticOnly ? '' : name} className="media-img" loading="lazy" />
        : <Placeholder />}
    </div>
  );
}

function DemoFrames({ entry, name, size, staticOnly }: { entry: ExerciseMedia } & Required<Pick<MediaProps, 'name' | 'size' | 'staticOnly'>>) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<(number | string)[]>([]);
  const frame = entry.frames[index];
  const license = licenses[entry.license];
  if (frame === undefined || license === undefined) return null;
  const position = t('media.position', [index + 1, entry.frames.length]);
  const source = entry.source?.[index] ?? `https://wger.de/api/v2/exerciseimage/${frame}/`;
  const image = (
    <div className="media-root" data-size={size} data-demo="local">
      {failed.includes(frame) ? <Placeholder /> : (
        <img className="media-img" src={`${import.meta.env.BASE_URL}exercise-media/${frame}.webp`}
          alt={staticOnly ? '' : `${name} · ${position}`}
          loading="lazy" onError={() => setFailed((frames) => [...frames, frame])} />
      )}
    </div>
  );

  if (staticOnly) return image;

  return (
    <figure className="media-demo">
      {image}
      {entry.frames.length > 1 && (
        <div className="media-controls" aria-label={t('media.positions')}>
          <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label={t('media.previousPosition')}>
            <ChevronLeft size={18} />
          </button>
          <span aria-live="polite">{position}</span>
          <button type="button" onClick={() => setIndex(index + 1)} disabled={index === entry.frames.length - 1} aria-label={t('media.nextPosition')}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      <figcaption className="media-attribution">
        <a href={source} target="_blank" rel="noreferrer">{entry.author}</a>
        {' · '}
        <a href={license.url} target="_blank" rel="noreferrer">{license.name}</a>
        {' · '}{t('media.adapted')}
      </figcaption>
    </figure>
  );
}

function Placeholder() {
  return <div className="media-placeholder" aria-hidden="true"><Dumbbell /></div>;
}
