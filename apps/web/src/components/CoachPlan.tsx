import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, MuscleGroup, Settings, Weekday, WorkoutLog } from '@forja/core';
import { db } from '../db/db';
import { setWeekday } from '../db/repo';
import { eligiblePlanExercises, parseWeekday, planCandidates, saveCoachPlan, type CoachPlanResult, type PlanFocus, type PlanGoal, type PlanVenue } from '../lib/coach-plan';
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

// Unified entry used by both import-whole-plan and split modes.
interface PlanDayEntry {
  label: string;
  weekday?: Weekday;
  result?: CoachPlanResult;
  error?: string;
  savedId?: string;
  scheduled?: 'yes' | 'skipped';
}

type PlanMode = 'reference' | 'split';
type SplitKind = 'upper-lower' | 'upper-lower-cardio' | 'full-body' | 'push-pull-legs';
type DayRole = 'upper' | 'lower' | 'full' | 'push' | 'pull' | 'legs' | 'cardio';

const SPLIT_ROLES: Record<SplitKind, DayRole[]> = {
  'upper-lower': ['upper', 'lower'],
  'upper-lower-cardio': ['upper', 'lower', 'cardio'],
  'full-body': ['full'],
  'push-pull-legs': ['push', 'pull', 'legs'],
};

// Monday-first sort order for weekdays.
const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

// Muscle groups per role (used to filter eligible exercises client-side).
const ROLE_MUSCLES: Record<DayRole, Set<MuscleGroup>> = {
  upper:  new Set(['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps']),
  lower:  new Set(['quads', 'hamstrings', 'glutes', 'calves']),
  full:   new Set(['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps',
                   'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques', 'fullbody']),
  push:   new Set(['chest', 'shoulders', 'triceps']),
  pull:   new Set(['back', 'lats', 'biceps', 'traps', 'forearms']),
  legs:   new Set(['quads', 'hamstrings', 'glutes', 'calves']),
  cardio: new Set(),
};

// Which backend focus to send per role.
const ROLE_FOCUS: Record<DayRole, PlanFocus> = {
  upper: 'upper',
  lower: 'lower',
  full:  'full',
  push:  'upper',
  pull:  'upper',
  legs:  'lower',
  cardio: 'full', // unused for cardio days
};

export function CoachPlan({ exercises, workouts, settings, model, destination, provider, external }: Props) {
  const t = useT();
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);

  // Shared fields
  const [goal, setGoal] = useState<PlanGoal>('general');
  const [focus, setFocus] = useState<PlanFocus>('full');
  const [minutes, setMinutes] = useState(40);
  const [venue, setVenue] = useState<PlanVenue>('home');
  const [useInventory, setUseInventory] = useState(false);

  // Reference / import mode
  const [reference, setReference] = useState<CoachReference>();
  const [dayItems, setDayItems] = useState<CoachReference[]>([]);
  const [readingReference, setReadingReference] = useState(false);

  // Single-day generate result
  const [result, setResult] = useState<CoachPlanResult>();
  const [categoryId, setCategoryId] = useState('');
  const [savedId, setSavedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Multi-day preview (shared between import and split modes)
  const [planDays, setPlanDays] = useState<PlanDayEntry[]>([]);
  const [generatingDay, setGeneratingDay] = useState<{ current: number; total: number } | undefined>();
  const [allSaved, setAllSaved] = useState(false);
  const [scheduleWeek, setScheduleWeek] = useState(true);

  // Mode toggle
  const [mode, setMode] = useState<PlanMode>('reference');

  // Split config
  const [split, setSplit] = useState<SplitKind>('upper-lower');
  const [trainingDays, setTrainingDays] = useState<Set<Weekday>>(new Set([1, 2, 3, 4, 5] as Weekday[]));
  const [cardioMinutes, setCardioMinutes] = useState(30);
  const [selectedCardioId, setSelectedCardioId] = useState('');

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
  // Full-library eligible set for multi-day generation (focus forced to 'full')
  const eligibleFull = useMemo(() => eligiblePlanExercises(exercises ?? [], inventory, 'full', restrictEquipment, venue),
    [exercises, inventory, restrictEquipment, venue]);
  const alternativesFor = (exerciseId: string) => {
    const exercise = eligible.find(({ id }) => id === exerciseId);
    return venue === 'gym' && exercise ? planAlternatives(exercise, eligible) : [];
  };
  const alternativesForFull = (exerciseId: string) => {
    const exercise = eligibleFull.find(({ id }) => id === exerciseId);
    return venue === 'gym' && exercise ? planAlternatives(exercise, eligibleFull) : [];
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

  // Keep selectedCardioId in sync with cardio list
  useEffect(() => {
    const first = cardio[0];
    if (first && (!selectedCardioId || !cardio.some(({ id }) => id === selectedCardioId))) {
      setSelectedCardioId(first.id);
    }
  }, [cardio, selectedCardioId]);

  useEffect(() => () => request.current?.abort(), []);

  function resetPreview() {
    setResult(undefined);
    setSavedId('');
    setError('');
  }

  function resetMultiPreview() {
    setPlanDays([]);
    setGeneratingDay(undefined);
    setAllSaved(false);
  }

  async function generate() {
    if (request.current || readingReference || !model || options.length < 3) return;
    resetPreview();
    resetMultiPreview();
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

  async function generateAll() {
    if (request.current || readingReference || !model || dayItems.length <= 1) return;
    resetPreview();
    resetMultiPreview();
    const days = dayItems.slice(0, 12);
    const capped = dayItems.length > 12;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    // Build entries with label and weekday pre-parsed (no longer parsed in saveAll).
    const entries: PlanDayEntry[] = days.map((day) => ({
      label: day.label,
      weekday: parseWeekday(day.label),
    }));
    setPlanDays([...entries]);
    try {
      for (const [i, day] of days.entries()) {
        if (controller.signal.aborted) break;
        setGeneratingDay({ current: i + 1, total: days.length });
        const dayCandidates = planCandidates(
          eligibleFull,
          restrictEquipment ? names : [],
          day.exercises.map((e) => e.name),
        );
        if (dayCandidates.length < 3) {
          entries[i] = { label: day.label, weekday: parseWeekday(day.label), error: t('coach.planDayFew') };
          setPlanDays([...entries]);
          continue;
        }
        try {
          const draft = await post<CoachPlanResult>('/coach/plans', {
            model, provider, goal, focus: 'full', minutes, venue, lang: english ? 'en' : 'pt',
            exercises: dayCandidates,
            reference: { kind: day.kind, exercises: day.exercises },
            inventory: restrictEquipment ? inventory.slice(0, 100).map(({ name, quantity, unitWeightKg }) => ({
              name: name.trim().slice(0, 80), quantity, unitWeightKg,
            })) : undefined,
            ...(weightLoss ? { cardioCandidates: cardio.map(({ id, name }) => ({ id, name })),
              weightGoal: { currentKg, targetKg } } : {}),
          }, controller.signal);
          if (controller.signal.aborted) break;
          const displayLabel = day.label.trim().slice(0, 80);
          const namedDraft: CoachPlanResult = { ...draft, name: displayLabel || draft.name };
          entries[i] = { label: day.label, weekday: parseWeekday(day.label), result: namedDraft };
          setPlanDays([...entries]);
        } catch (failure) {
          if (controller.signal.aborted) break;
          entries[i] = { label: day.label, weekday: parseWeekday(day.label), error: t('coach.planDayError', [syncMessage(failure, t)]) };
          setPlanDays([...entries]);
        }
      }
      if (!controller.signal.aborted && capped) {
        setError(t('coach.planAllCapped'));
      }
    } finally {
      request.current = null;
      setBusy(false);
      setGeneratingDay(undefined);
    }
  }

  async function generateSplit() {
    if (request.current || !model || trainingDays.size === 0) return;
    resetPreview();
    resetMultiPreview();

    const roles = SPLIT_ROLES[split];
    // Sort selected days in Monday-first order.
    const sortedDays = WEEKDAY_ORDER.filter((wd) => trainingDays.has(wd));
    // Assign roles by cycling over sorted days. The non-null assertion is safe:
    // roles is a non-empty const array and i % roles.length is always a valid index.
    const dayRoles: Array<{ weekday: Weekday; role: DayRole }> = sortedDays.map((wd, i) => ({
      weekday: wd,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      role: roles[i % roles.length]!,
    }));

    // Count how many times each role appears (for A/B suffix).
    const roleCount = new Map<DayRole, number>();
    const roleIndex = new Map<DayRole, number>();
    for (const { role } of dayRoles) {
      roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);

    const buildLabel = (role: DayRole): string => {
      const roleLabel = t('coach.role.' + role);
      const count = roleCount.get(role) ?? 1;
      if (count <= 1) return roleLabel;
      const idx = (roleIndex.get(role) ?? 0) + 1;
      roleIndex.set(role, idx);
      return `${roleLabel} ${String.fromCharCode(64 + idx)}`; // A, B, C…
    };

    // Build initial entries (placeholder labels — labels are built during generation to get correct A/B).
    // We pre-build entries now so progress updates work.
    const entries: PlanDayEntry[] = dayRoles.map(({ weekday, role }) => ({
      label: t('coach.role.' + role),
      weekday,
    }));
    setPlanDays([...entries]);

    // Reset roleIndex for actual label assignment during generation.
    roleIndex.clear();

    try {
      for (const [i, { weekday, role }] of dayRoles.entries()) {
        if (controller.signal.aborted) break;
        setGeneratingDay({ current: i + 1, total: dayRoles.length });

        const label = buildLabel(role);
        // Update the placeholder label now that we know A/B.
        entries[i] = { label, weekday };
        setPlanDays([...entries]);

        if (role === 'cardio') {
          // Build cardio day locally without calling AI.
          if (!selectedCardioId || cardio.length === 0) {
            entries[i] = { label, weekday, error: t('coach.splitNoCardio') };
            setPlanDays([...entries]);
            continue;
          }
          const cardioResult: CoachPlanResult = {
            name: label,
            summary: t('coach.splitCardioSummary', [cardioMinutes]),
            exercises: [],
            cardio: { exerciseId: selectedCardioId, seconds: cardioMinutes * 60 },
          };
          entries[i] = { label, weekday, result: cardioResult };
          setPlanDays([...entries]);
          continue;
        }

        // Strength day: filter eligible exercises by role muscles.
        const roleMuscles = ROLE_MUSCLES[role];
        const mappedFocus = ROLE_FOCUS[role];
        const base = eligiblePlanExercises(exercises ?? [], inventory, mappedFocus, restrictEquipment, venue);
        const roleEligible = base.filter((ex) => roleMuscles.has(ex.primaryMuscle));
        const candidates = planCandidates(roleEligible, restrictEquipment ? names : [], []);

        if (candidates.length < 3) {
          entries[i] = { label, weekday, error: t('coach.planDayFew') };
          setPlanDays([...entries]);
          continue;
        }

        try {
          const draft = await post<CoachPlanResult>('/coach/plans', {
            model, provider, goal, focus: mappedFocus, minutes, venue,
            lang: english ? 'en' : 'pt',
            exercises: candidates,
            inventory: restrictEquipment ? inventory.slice(0, 100).map(({ name, quantity, unitWeightKg }) => ({
              name: name.trim().slice(0, 80), quantity, unitWeightKg,
            })) : undefined,
            // No reference in split mode; no weight-loss cardio block (cardio handled by dedicated days).
          }, controller.signal);
          if (controller.signal.aborted) break;
          entries[i] = { label, weekday, result: { ...draft, name: label } };
          setPlanDays([...entries]);
        } catch (failure) {
          if (controller.signal.aborted) break;
          entries[i] = { label, weekday, error: t('coach.planDayError', [syncMessage(failure, t)]) };
          setPlanDays([...entries]);
        }
      }
    } finally {
      request.current = null;
      setBusy(false);
      setGeneratingDay(undefined);
    }
  }

  async function save() {
    if (!result || !selectedCategory || saving.current || savedId) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const substitutions = result.exercises.flatMap(({ exerciseId }) => {
        const opts = alternativesFor(exerciseId);
        const exercise = eligible.find(({ id }) => id === exerciseId);
        return opts.length && exercise ? [`${exercise.name} → ${opts.map(({ name }) => name).join(' / ')}`] : [];
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

  async function saveAll() {
    if (!selectedCategory || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    const updated: PlanDayEntry[] = planDays.map((e) => ({ ...e }));
    // One routine per weekday: first saved routine wins its day, later ones skip.
    const taken = new Set<Weekday>();
    for (const entry of updated) {
      const wd = entry.scheduled === 'yes' ? entry.weekday : undefined;
      if (wd !== undefined) taken.add(wd);
    }
    try {
      for (const [i, entry] of updated.entries()) {
        if (!entry.result || entry.savedId) continue;
        const substitutions = entry.result.exercises.flatMap(({ exerciseId }) => {
          const opts = alternativesForFull(exerciseId);
          const exercise = eligibleFull.find(({ id }) => id === exerciseId);
          return opts.length && exercise ? [`${exercise.name} → ${opts.map(({ name }) => name).join(' / ')}`] : [];
        });
        const note = substitutions.length ? [t('coach.variantsNote'), ...substitutions].join('\n') : undefined;
        try {
          const saved = await saveCoachPlan(entry.result, selectedCategory, restrictEquipment, note);
          let scheduled: PlanDayEntry['scheduled'];
          if (scheduleWeek) {
            const wd = entry.weekday;
            if (wd !== undefined && !taken.has(wd)) {
              try { await setWeekday(wd, saved.id); taken.add(wd); scheduled = 'yes'; }
              catch { scheduled = 'skipped'; }
            } else scheduled = 'skipped';
          }
          updated[i] = { label: entry.label, weekday: entry.weekday, result: entry.result, savedId: saved.id, scheduled };
          setPlanDays([...updated]);
        } catch (failure) {
          const msg = failure instanceof SyncError && failure.code === 'STALE_PROPOSAL'
            ? t('coach.planStale')
            : t('ui.saveRoutineFailed');
          updated[i] = { label: entry.label, weekday: entry.weekday, result: entry.result, savedId: entry.savedId, error: msg };
          setPlanDays([...updated]);
        }
      }
      const hasUnsaved = updated.some((e) => e.result && !e.savedId);
      if (!hasUnsaved) setAllSaved(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const multiMode = mode === 'reference' && dayItems.length > 1;
  const splitHasCardio = split === 'upper-lower-cardio';

  function toggleDay(wd: Weekday) {
    setTrainingDays((prev) => {
      const next = new Set(prev);
      if (next.has(wd)) { next.delete(wd); } else { next.add(wd); }
      return next;
    });
    resetMultiPreview();
  }

  return (
    <section className="card self-host-card" id="montar-treino">
      <h2>{t('coach.planTitle')}</h2>
      <p className="hint">{t('coach.plansRest')}</p>

      {/* Mode toggle */}
      <div className="coach-plan-mode" role="group" aria-label={t('coach.planTitle')}>
        {(['reference', 'split'] as const).map((m) => (
          <label key={m} className={'coach-plan-mode-option' + (mode === m ? ' selected' : '')}>
            <input
              type="radio"
              name="coach-plan-mode"
              value={m}
              checked={mode === m}
              onChange={() => { setMode(m); resetPreview(); resetMultiPreview(); }}
            />
            {t(m === 'reference' ? 'coach.planModeReference' : 'coach.planModeSplit')}
          </label>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); if (mode === 'reference') void generate(); }}>
        <fieldset className="coach-plan-inputs" disabled={busy}>
          <div className="coach-plan-fields">
            <label><span id="coach-venue-label">{t('coach.venue')}</span><select aria-labelledby="coach-venue-label" value={venue}
              onChange={(event) => { setVenue(event.target.value as PlanVenue); resetPreview(); resetMultiPreview(); }}>
              <option value="home">{t('coach.venue.home')}</option>
              <option value="gym">{t('coach.venue.gym')}</option>
            </select></label>
            <label><span id="coach-goal-label">{t('coach.goal')}</span><select aria-labelledby="coach-goal-label" value={goal}
              onChange={(event) => { setGoal(event.target.value as PlanGoal); resetPreview(); resetMultiPreview(); }}>
              {(['general', 'strength', 'muscle', 'weight-loss'] as const).map((value) => <option key={value} value={value}>{t('coach.goal.' + value)}</option>)}
            </select></label>
            {mode === 'reference' && (
              <label><span id="coach-focus-label">{t('coach.focus')}</span><select aria-labelledby="coach-focus-label" value={focus}
                onChange={(event) => { setFocus(event.target.value as PlanFocus); resetPreview(); resetMultiPreview(); }}>
                {(['full', 'upper', 'lower'] as const).map((value) => <option key={value} value={value}>{t('coach.focus.' + value)}</option>)}
              </select></label>
            )}
            <label>{t('coach.minutes')}<input type="number" required min={15} max={90} value={minutes || ''}
              onChange={(event) => { setMinutes(Number(event.target.value)); resetPreview(); resetMultiPreview(); }} /></label>
          </div>
          <div className="coach-inventory-choice">
            {venue === 'home' ? <span className="hint">{inventory.length
              ? t('coach.homeEquipmentList', [inventory.map(({ name, quantity, unitWeightKg }) =>
                [quantity === undefined ? name : t('coach.inventoryCount', [quantity, name]),
                  unitWeightKg === undefined ? '' : t('inventory.weightEach', [formatter.format(unitWeightKg)])].filter(Boolean).join(' · ')).join(' / ')])
              : t('coach.homeEquipment')}</span> :
              <label className="coach-plan-inventory"><input type="checkbox" checked={useInventory}
                onChange={(event) => { setUseInventory(event.target.checked); resetPreview(); resetMultiPreview(); }} /> {t('ui.applyMyEquipment')}</label>}
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

        {mode === 'reference' && (
          <>
            <CoachReferencePicker catalog={exercises ?? []} workouts={workouts ?? []} disabled={busy}
              reference={reference} onReading={setReadingReference}
              onChange={(value) => { setReference(value); resetPreview(); resetMultiPreview(); }}
              onItems={(items) => { setDayItems(items); resetPreview(); resetMultiPreview(); }} />
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
              {multiMode && (
                <button className="btn" type="button"
                  disabled={!model || busy || readingReference}
                  onClick={() => void generateAll()}>
                  {t('coach.generateAll', [Math.min(dayItems.length, 12)])}
                </button>
              )}
              {request.current && <button className="btn ghost" type="button" onClick={() => request.current?.abort()}>{t('tg.cancel')}</button>}
            </div>
          </>
        )}

        {mode === 'split' && (
          <fieldset className="coach-plan-inputs" disabled={busy}>
            <div className="coach-plan-fields">
              <label>
                <span id="coach-split-label">{t('coach.splitLabel')}</span>
                <select aria-labelledby="coach-split-label" value={split}
                  onChange={(event) => { setSplit(event.target.value as SplitKind); resetMultiPreview(); }}>
                  {(['upper-lower', 'upper-lower-cardio', 'full-body', 'push-pull-legs'] as const).map((s) => (
                    <option key={s} value={s}>{t('coach.split.' + s)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="coach-plan-fields">
              <fieldset>
                <legend>{t('coach.trainingDays')}</legend>
                <div className="coach-weekday-checks">
                  {WEEKDAY_ORDER.map((wd) => (
                    <label key={wd} className="coach-weekday-check">
                      <input
                        type="checkbox"
                        checked={trainingDays.has(wd)}
                        onChange={() => toggleDay(wd)}
                      />
                      {t('wd.short.' + wd)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {splitHasCardio && (
              <div className="coach-plan-fields">
                <label>
                  {t('coach.cardioMinutes')}
                  <input type="number" min={10} max={90} value={cardioMinutes || ''}
                    onChange={(event) => { setCardioMinutes(Number(event.target.value)); resetMultiPreview(); }} />
                </label>
                {cardio.length > 0 ? (
                  <label>
                    <span id="coach-cardio-ex-label">{t('coach.cardioExercise')}</span>
                    <select aria-labelledby="coach-cardio-ex-label" value={selectedCardioId}
                      onChange={(event) => { setSelectedCardioId(event.target.value); resetMultiPreview(); }}>
                      {cardio.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </label>
                ) : (
                  <p className="hint">{t('coach.splitNoCardio')}</p>
                )}
              </div>
            )}
            <div className="self-host-actions">
              <button className="btn" type="button"
                disabled={!model || busy || trainingDays.size === 0}
                onClick={() => void generateSplit()}>
                {t('coach.generateSplit')}
              </button>
              {request.current && <button className="btn ghost" type="button" onClick={() => request.current?.abort()}>{t('tg.cancel')}</button>}
            </div>
          </fieldset>
        )}
      </form>

      {error && <p className="feedback error" role="alert">{error}</p>}
      {generatingDay && (
        <p className="hint" role="status">{t('coach.generatingDay', [generatingDay.current, generatingDay.total])}</p>
      )}

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

      {planDays.length > 0 && (
        <div className="coach-proposal self-host-card">
          {planDays.map((entry, index) => (
            <div key={entry.label + '-' + index} className="self-host-card">
              <h3>{entry.label || `${index + 1}`}</h3>
              {entry.error && !entry.result && (
                <p className="feedback error">{entry.error}</p>
              )}
              {entry.result && (
                <>
                  <p>{entry.result.summary}</p>
                  {entry.result.estimatedMinutes !== undefined && (
                    <p className="hint">{t('coach.estimate', [entry.result.estimatedMinutes])}</p>
                  )}
                  <ul className="self-host-list">
                    {entry.result.exercises.map(({ exerciseId, sets, reps, restSec }) => {
                      const variants = alternativesForFull(exerciseId);
                      return <li key={exerciseId}>
                        <strong>{eligibleFull.find(({ id }) => id === exerciseId)?.name ?? exerciseId}</strong>
                        <span>{t('coach.planSet', [sets, reps, restSec])}</span>
                        {!!variants.length && <span className="coach-alternatives hint">
                          {t('coach.variants', [variants.map(({ name }) => name).join(' · ')])}
                        </span>}
                      </li>;
                    })}
                    {entry.result.cardio && <li>
                      <strong>{cardio.find(({ id }) => id === entry.result?.cardio?.exerciseId)?.name ?? t('coach.cardioTitle')}</strong>
                      <span>{t('coach.cardioTime', [formatter.format((entry.result.cardio.seconds) / 60)])}</span>
                      <span className="coach-alternatives hint">{t('coach.cardioIntensity')}</span>
                    </li>}
                  </ul>
                  {entry.savedId
                    ? <p role="status">{t('coach.planSaved')} <Link to={'/treinos/rotina/' + encodeURIComponent(entry.savedId)}>{t('re.editRoutine')}</Link>
                      {entry.scheduled === 'yes' && <span className="hint"> · {t('coach.scheduled')}</span>}
                      {entry.scheduled === 'skipped' && <span className="hint"> · {t('coach.scheduleSkipped')}</span>}</p>
                    : entry.error
                      ? <p className="feedback error">{entry.error}</p>
                      : null}
                </>
              )}
            </div>
          ))}
          {allSaved
            ? <p role="status">{t('coach.allSaved')}</p>
            : (
              <>
                <label>{t('ui.category')}<select value={selectedCategory} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
                  {categories?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select></label>
                <label className="coach-plan-inventory"><input type="checkbox" checked={scheduleWeek} disabled={busy}
                  onChange={(event) => setScheduleWeek(event.target.checked)} /> {t('coach.scheduleWeek')}</label>
                <div className="self-host-actions">
                  <button className="btn" type="button"
                    disabled={busy || !selectedCategory || planDays.every((e) => !e.result || !!e.savedId)}
                    onClick={() => void saveAll()}>
                    {t('coach.saveAll')}
                  </button>
                </div>
              </>
            )}
        </div>
      )}
    </section>
  );
}
