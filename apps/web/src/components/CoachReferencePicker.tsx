import { useMemo, useState } from 'react';
import type { Exercise, WorkoutLog } from '@forja/core';
import { useT } from '../lib/i18n';
import { localCoachReferences, readCoachReferences, type CoachReference, type ReferenceSource } from '../lib/coach-reference';
import { UiError } from '../lib/ui-error';
import { CoachFileInput } from './CoachFileInput';

const formats = ['external', 'hevy', 'strong', 'fitnotes', 'backup', 'plan'] as const;
type Source = ReferenceSource | 'none' | 'history';

interface Props {
  catalog: readonly Exercise[];
  workouts: readonly WorkoutLog[];
  reference: CoachReference | undefined;
  onChange: (value: CoachReference | undefined) => void;
  onItems?: (items: CoachReference[]) => void;
  disabled: boolean;
  onReading: (reading: boolean) => void;
}

export function CoachReferencePicker({ catalog, workouts, reference, onChange, onItems, disabled, onReading }: Props) {
  const t = useT();
  const [source, setSource] = useState<Source>('none');
  const [fileItems, setFileItems] = useState<CoachReference[]>([]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const history = useMemo(() => source === 'history' ? localCoachReferences(workouts, catalog) : [], [source, workouts, catalog]);
  const items = source === 'history' ? history : fileItems;
  const needsFile = source !== 'none' && source !== 'history';

  async function read(file: File | undefined, format: ReferenceSource) {
    setError('');
    setFileItems([]);
    onChange(undefined);
    onItems?.([]);
    if (!file) return;
    setReading(true);
    onReading(true);
    try {
      const next = await readCoachReferences(file, format, catalog);
      setFileItems(next);
      if (format === 'plan' || (format === 'external' && /\.json$/i.test(file.name))) onItems?.(next);
      onChange(next[0]);
    } catch (failure) {
      setError(failure instanceof UiError ? t(failure.key, failure.args) : t('ui.importError'));
    } finally {
      setReading(false);
      onReading(false);
    }
  }

  return (
    <details className="coach-reference">
      <summary>{source === 'external' && items.length > 0 ? t('coach.referenceAllDays', [items.length])
        : reference ? t('coach.referenceAttached', [reference.label]) : t('coach.referenceTitle')}</summary>
      <div className="coach-reference-fields">
        <p className="hint">{t('coach.referenceHelp')}</p>
        <label>{t('coach.referenceSource')}<select value={source} disabled={disabled || reading} onChange={(event) => {
          const next = event.target.value as Source;
          setSource(next);
          setFileItems([]);
          setError('');
          onChange(undefined);
          onItems?.([]);
        }}>
          <option value="none">{t('coach.referenceNone')}</option>
          <option value="history">{t('coach.referenceHistory')}</option>
          {formats.map((format) => <option value={format} key={format}>{t('coach.reference.' + format)}</option>)}
        </select></label>
        {source === 'external' && <p className="hint">{t('coach.referenceExternalHelp')}</p>}
        {needsFile && <CoachFileInput key={source} disabled={disabled || reading}
          accept={source === 'external' ? '.csv,text/csv,.json,application/json'
            : source === 'plan' || source === 'backup' ? '.json,application/json' : '.csv,text/csv'}
          onFile={(file) => void read(file, source)} />}
        {source === 'history' && items.length === 0 && <p className="hint">{t('coach.referenceEmpty')}</p>}
        {items.length > 0 && source === 'external' && <p className="hint">{t('coach.referenceAllDays', [items.length])}</p>}
        {items.length > 0 && (
          <label>{t('coach.referenceSession')}<select disabled={disabled} value={reference?.key ?? ''}
            onChange={(event) => onChange(items.find((item) => item.key === event.target.value))}>
            <option value="">{t('coach.referenceChoose')}</option>
            {items.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
        )}
        {reference && (
          <>
            <p className="hint">{t(reference.kind === 'logged' ? 'coach.referenceLogged' : 'coach.referencePrescribed')}</p>
            <ul className="self-host-list">
              {reference.exercises.map((item, index) => <li key={index}>
                <span>{item.name}</span>
                <span>{t('coach.referenceSet', [item.sets])}{item.reps && ` · ${item.reps} reps`}
                  {item.seconds !== undefined && ` · ${item.seconds} s`}{item.loadKg !== undefined && ` · ${item.loadKg} kg`}</span>
              </li>)}
            </ul>
          </>
        )}
        {error && <p className="feedback error" role="alert">{error}</p>}
      </div>
    </details>
  );
}
