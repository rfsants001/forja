import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Settings, WorkoutLog } from '@forja/core';
import { db } from '../db/db';
import { eligiblePlanExercises, planCandidates, saveCoachPlan, type CoachPlanResult, type PlanFocus, type PlanGoal, type PlanVenue } from '../lib/coach-plan';
import { planAlternatives } from '../lib/coach-movements';
import { cardioExercises } from '../lib/coach-cardio';
import { equipmentItems, inventoryKeys, supportsEquipment } from '../lib/equipment';
import type { CoachReference } from '../lib/coach-reference';
import { CoachReferencePicker } from './CoachReferencePicker';
import { useT } from '../lib/i18n';
import { post, SyncError } from '../lib/sync-client';
import { syncMessage } from '../pages/Dispositivos';

interface Props {
  exercises: Exercise[] | undefined;
  workouts: WorkoutLog[] | undefined;
  settings: Settings | undefined;
  model: string;
  destination?: string;
  provider?: string;
  external: boolean;
}

export function CoachPlan({ exercises, workouts, settings, model, destination, provider, external }: Props) {
  const t = useT();
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const [goal, setGoal] = useState<PlanGoal>('general');
  const [focus, setFocus] = useState<PlanFocus>('full');
  const [minutes, setMinutes] = useState(40);
  const [venue, setVenue] = useState<PlanVenue>('home');
  const [useInventory, setUseInventory] = useState(false);
  const [reference, setReference] = useState<CoachReference>();
  const [readingReference, setReadingReference] = useState(false);
  const [result, setResult] = useState<CoachPlanResult>();
  const [categoryId, setCategoryId] = useState('');
  const [savedId, setSavedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const restrictEquipment = venue === 'home' || useInventory;
  const weightLoss = goal === 'weight-loss';
  const latestWeight = useLiveQuery(() => weightLoss ? db.bodyweight.orderBy('dateISO').last() : undefined, [weightLoss]);
  const inventory = useMemo(() => equipmentItems(settings), [settings]);
  const names = useMemo(() => inventory.map(({ name }) => name), [inventory]);
  const eligible = useMemo(() => eligiblePlanExercises(exercises ?? [], inventory, focus, restrictEquipment, venue),
    [exercises, inventory, focus, restrictEquipment, venue]);
  const options = useMemo(() => planCandidates(eligible, restrictEquipment ? names : [],
    reference?.exercises.map(({ name }) => name) ?? []),
    [eligible, restrictEquipment, names, reference]);
  const alternativesFor = (exerciseId: string) => {
    const exercise = eligible.find(({ id }) => id === exerciseId);
    return venue === 'gym' && exercise ? planAlternatives(exercise, eligible) : [];
  };
  const english = settings?.lang === 'en';
  const cardio = useMemo(() => {
    const available = inventoryKeys(names);
    return cardioExercises(english ? 'en' : 'pt').filter((exercise) => !restrictEquipment || supportsEquipment(exercise.equipment, available));
  }, [names, restrictEquipment, english]);
  const currentKg = latestWeight?.kg;
  const targetKg = settings?.bodyWeightGoalKg;
  const formatter = new Intl.NumberFormat(english ? 'en' : 'pt-BR', { maximumFractionDigits: 2 });
  const weightLabel = (value?: number) => value ? formatter.format(value) + ' kg' : t('coach.weightMissing');
  const selectedCategory = categories?.some((item) => item.id === categoryId) ? categoryId : categories?.[0]?.id ?? '';
  useEffect(() => () => request.current?.abort(), []);

  function resetPreview() {
    setResult(undefined);
    setSavedId('');
    setError('');
  }

  async function generate() {
    if (request.current || readingReference || !model || options.length < 3) return;
    resetPreview();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const draft = await post<CoachPlanResult>('/coach/plans', {
        model, provider, goal, focus, minutes, venue, lang: english ? 'en' : 'pt', exercises: options,
        reference: reference && { kind: reference.kind, exercises: reference.exercises },
        inventory: restrictEquipment ? inventory.slice(0, 100).map(({ name, quantity, unitWeightKg }) => ({
          name: name.trim().slice(0, 80), quantity, unitWeightKg,
        })) : undefined,
        ...(weightLoss ? { cardioCandidates: cardio.map(({ id, name }) => ({ id, name })),
          weightGoal: { currentKg, targetKg } } : {}),
      }, controller.signal);
      if (!controller.signal.aborted) setResult(draft);
    } catch (failure) {
      if (!controller.signal.aborted) setError(syncMessage(failure, t));
    } finally {
      request.current = null;
      setBusy(false);
    }
  }

  async function save() {
    if (!result || !selectedCategory || saving.current || savedId) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const substitutions = result.exercises.flatMap(({ exerciseId }) => {
        const options = alternativesFor(exerciseId);
        const exercise = eligible.find(({ id }) => id === exerciseId);
        return options.length && exercise ? [`${exercise.name} → ${options.map(({ name }) => name).join(' / ')}`] : [];
      });
      const note = substitutions.length ? [t('coach.variantsNote'), ...substitutions].join('\n') : undefined;
      setSavedId((await saveCoachPlan(result, selectedCategory, restrictEquipment, note)).id);
    } catch (failure) {
      setError(failure instanceof SyncError && failure.code === 'STALE_PROPOSAL' ? t('coach.planStale') : t('ui.saveRoutineFailed'));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="card self-host-card" id="montar-treino">
      <h2>{t('coach.planTitle')}</h2>
      <p className="hint">{t('coach.plansRest')}</p>
      <form onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <fieldset className="coach-plan-inputs" disabled={busy}>
          <div className="coach-plan-fields">
            <label><span id="coach-venue-label">{t('coach.venue')}</span><select aria-labelledby="coach-venue-label" value={venue}
              onChange={(event) => { setVenue(event.target.value as PlanVenue); resetPreview(); }}>
              <option value="home">{t('coach.venue.home')}</option>
              <option value="gym">{t('coach.venue.gym')}</option>
            </select></label>
            <label><span id="coach-goal-label">{t('coach.goal')}</span><select aria-labelledby="coach-goal-label" value={goal}
              onChange={(event) => { setGoal(event.target.value as PlanGoal); resetPreview(); }}>
              {(['general', 'strength', 'muscle', 'weight-loss'] as const).map((value) => <option key={value} value={value}>{t('coach.goal.' + value)}</option>)}
            </select></label>
            <label><span id="coach-focus-label">{t('coach.focus')}</span><select aria-labelledby="coach-focus-label" value={focus}
              onChange={(event) => { setFocus(event.target.value as PlanFocus); resetPreview(); }}>
              {(['full', 'upper', 'lower'] as const).map((value) => <option key={value} value={value}>{t('coach.focus.' + value)}</option>)}
            </select></label>
            <label>{t('coach.minutes')}<input type="number" required min={15} max={90} value={minutes || ''}
              onChange={(event) => { setMinutes(Number(event.target.value)); resetPreview(); }} /></label>
          </div>
          <div className="coach-inventory-choice">
            {venue === 'home' ? <span className="hint">{inventory.length
              ? t('coach.homeEquipmentList', [inventory.map(({ name, quantity, unitWeightKg }) =>
                [quantity === undefined ? name : t('coach.inventoryCount', [quantity, name]),
                  unitWeightKg === undefined ? '' : t('inventory.weightEach', [formatter.format(unitWeightKg)])].filter(Boolean).join(' · ')).join(' / ')])
              : t('coach.homeEquipment')}</span> :
              <label className="coach-plan-inventory"><input type="checkbox" checked={useInventory}
                onChange={(event) => { setUseInventory(event.target.checked); resetPreview(); }} /> {t('ui.applyMyEquipment')}</label>}
            <Link to="/perfil/equipamentos" state={{ from: 'coach' }}>{t('inventory.manage')}</Link>
          </div>
          {weightLoss && <div className="coach-weight-context">
            <dl className="coach-metrics">
              <div><dt>{t('coach.currentWeight')}</dt><dd>{weightLabel(currentKg)}</dd></div>
              <div><dt>{t('coach.targetWeight')}</dt><dd>{weightLabel(targetKg)}</dd></div>
            </dl>
            <p className="hint">{t('coach.weightUse')}</p>
            <Link to="/perfil#profile-weight">{t('coach.editWeight')}</Link>
          </div>}
        </fieldset>
        <CoachReferencePicker catalog={exercises ?? []} workouts={workouts ?? []} disabled={busy}
          reference={reference} onReading={setReadingReference} onChange={(value) => { setReference(value); resetPreview(); }} />
        <details>
          <summary>{t('coach.planInput', [options.length])}</summary>
          <p className="hint">{t('coach.planInputDetails')}</p>
          <ul className="self-host-list coach-plan-candidates">
            {options.map(({ id, name }) => <li key={id}>{name}</li>)}
          </ul>
        </details>
        {destination && <p className="hint">{t('coach.destination', [destination])}</p>}
        {exercises && options.length < 3 && <p className="hint">{t('coach.planEquipment')}</p>}
        <div className="self-host-actions">
          <button className="btn" disabled={!model || busy || readingReference || options.length < 3} type="submit">
            {t(external ? 'coach.sendPlan' : 'coach.generatePlan')}
          </button>
          {request.current && <button className="btn ghost" type="button" onClick={() => request.current?.abort()}>{t('tg.cancel')}</button>}
        </div>
      </form>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {result && (
        <div className="coach-proposal self-host-card">
          <h3>{result.name}</h3>
          <p>{result.summary}</p>
          {result.estimatedMinutes !== undefined && <p className="hint">{t('coach.estimate', [result.estimatedMinutes])}</p>}
          <ul className="self-host-list">
            {result.exercises.map(({ exerciseId, sets, reps, restSec }) => {
              const variants = alternativesFor(exerciseId);
              return <li key={exerciseId}>
                <strong>{eligible.find(({ id }) => id === exerciseId)?.name ?? exerciseId}</strong>
                <span>{t('coach.planSet', [sets, reps, restSec])}</span>
                {!!variants.length && <span className="coach-alternatives hint">
                  {t('coach.variants', [variants.map(({ name }) => name).join(' · ')])}
                </span>}
              </li>;
            })}
            {result.cardio && <li>
              <strong>{cardio.find(({ id }) => id === result.cardio?.exerciseId)?.name ?? t('coach.cardioTitle')}</strong>
              <span>{t('coach.cardioTime', [formatter.format(result.cardio.seconds / 60)])}</span>
              <span className="coach-alternatives hint">{t('coach.cardioIntensity')}</span>
            </li>}
          </ul>
          <details className="coach-evidence">
            <summary>{t('coach.evidence')}</summary>
            <p>{t('coach.evidence.goal.' + goal)}</p>
            <p>{t('coach.evidenceProgression')}</p>
            <p>{t('coach.evidenceRest')}</p>
            <a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noreferrer">ACSM (2026)</a>
            {weightLoss && <> · <a href="https://www.cdc.gov/healthy-weight-growth/physical-activity/" target="_blank"
              rel="noreferrer">{t('coach.cardioSource')}</a></>}
          </details>
          {savedId ? <p role="status">{t('coach.planSaved')} <Link to={'/treinos/rotina/' + encodeURIComponent(savedId)}>{t('re.editRoutine')}</Link></p> : (
            <>
              <label>{t('ui.category')}<select value={selectedCategory} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
                {categories?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select></label>
              <div className="self-host-actions">
                <button className="btn" type="button" disabled={busy || !selectedCategory} onClick={() => void save()}>{t('ui.saveRoutine')}</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
