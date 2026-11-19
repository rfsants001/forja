import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, MuscleGroup, Settings, Weekday, WorkoutLog } from '@forja/core';
import { db } from '../db/db';
import { setWeekday } from '../db/repo';
import { syncWrite } from '../db/sync-write';
import { PortablePlanImport, weekdayOrder as WEEKDAY_ORDER } from './PortablePlanImport';
import { eligiblePlanExercises, planCandidates, saveCoachPlan, trainingLevelCounts, type TrainingLevel, type CoachPlanResult, type PlanFocus, type PlanGoal, type PlanVenue } from '../lib/coach-plan';
import { planAlternatives } from '../lib/coach-movements';
import { cardioExercises } from '../lib/coach-cardio';
import { equipmentItems, inventoryKeys, supportsEquipment } from '../lib/equipment';
import type { CoachReference } from '../lib/coach-reference';
import { CoachReferencePicker } from './CoachReferencePicker';
import { WeekdayPicker } from './WeekdayPicker';
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

type PlanMode = 'reference' | 'split' | 'port';
type SplitKind = 'upper-lower' | 'upper-lower-cardio' | 'full-body' | 'push-pull-legs';
type DayRole = 'upper' | 'lower' | 'full' | 'push' | 'pull' | 'legs' | 'cardio';

const SPLIT_ROLES: Record<SplitKind, DayRole[]> = {
  'upper-lower': ['upper', 'lower'],
  'upper-lower-cardio': ['upper', 'lower', 'cardio'],
  'full-body': ['full'],
  'push-pull-legs': ['push', 'pull', 'legs'],
};

const dayRoles: DayRole[] = ['full', 'upper', 'lower', 'push', 'pull', 'legs', 'cardio'];

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
  const [trainingLevel, setTrainingLevel] = useState<TrainingLevel>('beginner');
  const exerciseCount = trainingLevelCounts[trainingLevel];
  const [useInventory, setUseInventory] = useState(false);

  // Reference / import mode
  const [reference, setReference] = useState<CoachReference>();
  const [dayItems, setDayItems] = useState<CoachReference[]>([]);
  const [readingReference, setReadingReference] = useState(false);
  const [sourceDays, setSourceDays] = useState<Partial<Record<Weekday, { key: string; role?: DayRole }>>>({});

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
  const [replaceDays, setReplaceDays] = useState(false);
  const occupied = useLiveQuery(async () => new Set((await db.weekPlan.toArray())
    .filter(({ routineId }) => routineId).map(({ weekday }) => weekday)), []);

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

  const resetMultiPreview = useCallback(() => {
    setPlanDays([]);
    setGeneratingDay(undefined);
    setAllSaved(false);
    setReplaceDays(false);
  }, []);

  const onFileItems = useCallback((items: CoachReference[]) => {
    setDayItems(items);
    // Attaching/replacing a reference must not erase the user's selected days and types.
    setSourceDays((previous) => Object.fromEntries(Object.entries(previous).map(([day, choice]) =>
      [day, choice && { ...choice, key: items.some(({ key }) => key === choice.key) ? choice.key : 'new' }])));
    resetMultiPreview();
  }, [resetMultiPreview]);

  async function generate() {
    if (request.current || readingReference || !model || options.length < exerciseCount || !validMinutes || multiMode) return;
    resetPreview();
    resetMultiPreview();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const draft = await post<CoachPlanResult>('/coach/plans', {
        model, provider, goal, focus, minutes, venue, trainingLevel, lang: english ? 'en' : 'pt', exercises: options,
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

  const forSource = WEEKDAY_ORDER.flatMap((weekday) => {
    const choice = sourceDays[weekday];
    const day = choice?.key === 'new' ? (dayItems.length ? undefined : reference) : dayItems.find(({ key }) => key === choice?.key);
    if (!choice?.role || (choice.key !== 'new' && !day)) return [];
    return [{ weekday, role: choice.role, label: day?.label ?? t('coach.role.' + choice.role) + ' · ' + t('wd.full.' + weekday),
      reference: day }];
  });
  const multiMode = mode === 'reference' && (dayItems.length > 0 || Object.values(sourceDays).some(Boolean));
  const sourceWeekdays = new Set(WEEKDAY_ORDER.filter((day) => sourceDays[day]));
  const allSourceRowsComplete = Object.values(sourceDays).every((choice) => !choice || choice.role);
  const splitHasCardio = split === 'upper-lower-cardio';
  const usesDedicatedCardio = mode === 'split' ? splitHasCardio : forSource.some(({ role }) => role === 'cardio');
  const validMinutes = Number.isInteger(minutes) && minutes >= 15 && minutes <= 90;
  const validCardioMinutes = Number.isInteger(cardioMinutes) && cardioMinutes >= 10 && cardioMinutes <= 90;

  function labelWeek(week: { weekday: Weekday; role: DayRole; reference?: CoachReference }[]) {
    const totals = new Map<DayRole, number>();
    const counts = new Map<DayRole, number>();
    for (const { role } of week) totals.set(role, (totals.get(role) ?? 0) + 1);
    return week.map((day) => {
      const variant = counts.get(day.role) ?? 0;
      counts.set(day.role, variant + 1);
      const suffix = day.role !== 'cardio' && totals.get(day.role)! > 1 ? ' ' + String.fromCharCode(65 + variant) : '';
      const label = t('coach.role.' + day.role) + suffix;
      return { ...day, variant, label: day.reference ? label + ' · ' + day.reference.label : label };
    });
  }

  const splitDays = WEEKDAY_ORDER.filter((day) => trainingDays.has(day)).map((weekday, index) => ({
    weekday, role: SPLIT_ROLES[split][index % SPLIT_ROLES[split].length]!,
  }));
  const splitPreview = labelWeek(splitDays);

  function generateSplit() {
    return generateWeek(splitDays);
  }

  async function generateWeek(week: { weekday: Weekday; role: DayRole; reference?: CoachReference }[]) {
    if (request.current || !week.length || !validMinutes || (usesDedicatedCardio && !validCardioMinutes)
      || (!model && week.some(({ role }) => role !== 'cardio'))) return;
    resetPreview();
    resetMultiPreview();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    const labeled = labelWeek(week);
    const entries: PlanDayEntry[] = labeled.map(({ weekday, label }) => ({ weekday, label }));
    const previousByRole = new Map<DayRole, CoachPlanResult[]>();
    setPlanDays([...entries]);
    try {
      for (const [index, { weekday, label, role, variant, reference: source }] of labeled.entries()) {
        if (controller.signal.aborted) break;
        setGeneratingDay({ current: index + 1, total: week.length });
        try {
          let draft: CoachPlanResult;
          if (role === 'cardio') {
            if (!cardio.some(({ id }) => id === selectedCardioId)) throw new Error('NO_CARDIO');
            draft = { name: label, summary: t('coach.splitCardioSummary', [cardioMinutes]), exercises: [],
              estimatedMinutes: cardioMinutes, cardio: { exerciseId: selectedCardioId, seconds: cardioMinutes * 60 } };
          } else {
            const focus = ROLE_FOCUS[role];
            const available = eligiblePlanExercises(exercises ?? [], inventory, focus, restrictEquipment, venue)
              .filter(({ primaryMuscle }) => ROLE_MUSCLES[role].has(primaryMuscle));
            const previous = previousByRole.get(role) ?? [];
            const retained = new Set(previous.flatMap(({ exercises }) => exercises.map(({ exerciseId }) => exerciseId)));
            const candidates = planCandidates(available, restrictEquipment ? names : [], source?.exercises.map(({ name }) => name) ?? [], retained);
            if (candidates.length < exerciseCount) throw new SyncError('PLAN_EXERCISE_COUNT_UNAVAILABLE');
            draft = await post<CoachPlanResult>('/coach/plans', {
              model, provider, goal, focus, minutes, venue, trainingLevel, lang: english ? 'en' : 'pt', exercises: candidates,
              week: { role, variant, previous: previous.map(({ exercises }) => ({ exercises })) },
              reference: source && { kind: source.kind, exercises: source.exercises },
              inventory: restrictEquipment ? inventory.slice(0, 100).map(({ name, quantity, unitWeightKg }) => ({
                name: name.trim().slice(0, 80), quantity, unitWeightKg,
              })) : undefined,
              ...(weightLoss ? { weightGoal: { currentKg, targetKg }, includeCardio: !usesDedicatedCardio,
                cardioCandidates: usesDedicatedCardio ? undefined : cardio.map(({ id, name }) => ({ id, name })) } : {}),
            }, controller.signal);
          }
          if (role !== 'cardio') {
            const previous = previousByRole.get(role) ?? [];
            previousByRole.set(role, [...previous, draft]);
          }
          if (!controller.signal.aborted) entries[index] = { weekday, label, result: { ...draft, name: label } };
        } catch (failure) {
          if (controller.signal.aborted) break;
          const reason = failure instanceof Error ? failure.message : '';
          entries[index] = { weekday, label, error: reason === 'FEW_EXERCISES' ? t('coach.planDayFew')
            : reason === 'NO_CARDIO' ? t('coach.splitNoCardio') : t('coach.planDayError', [syncMessage(failure, t)]) };
          setPlanDays([...entries]);
          break;
        }
        setPlanDays([...entries]);
      }
    } finally {
      request.current = null;
      setBusy(false);
      setGeneratingDay(undefined);
    }
  }

  function planNote(result: CoachPlanResult, pool: readonly Exercise[]) {
    if (venue !== 'gym') return undefined;
    const lines = result.exercises.flatMap(({ exerciseId }) => {
      const exercise = pool.find(({ id }) => id === exerciseId);
      if (!exercise) return [];
      const variants = planAlternatives(exercise, pool);
      return variants.length ? [exercise.name + ' → ' + variants.map(({ name }) => name).join(' / ')] : [];
    });
    return lines.length ? [t('coach.variantsNote'), ...lines].join('\n') : undefined;
  }

  async function save() {
    if (!result || !selectedCategory || saving.current || savedId) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      setSavedId((await saveCoachPlan(result, selectedCategory, restrictEquipment, planNote(result, eligible))).id);
    } catch (failure) {
      setError(failure instanceof SyncError && failure.code === 'STALE_PROPOSAL' ? t('coach.planStale') : t('ui.saveRoutineFailed'));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const scheduleConflict = planDays.some(({ weekday }) => weekday !== undefined && occupied?.has(weekday));
  async function saveAll() {
    if (!selectedCategory || saving.current || !planDays.length || planDays.some(({ result }) => !result)
      || (scheduleConflict && !replaceDays)) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = await syncWrite(['routines', 'categories', 'exercises', 'settings', 'weekPlan'], async () => {
        const result = [];
        for (const entry of planDays) {
          if (entry.weekday === undefined || !entry.result) throw new SyncError('STALE_PROPOSAL');
          if (!replaceDays && (await db.weekPlan.get(entry.weekday))?.routineId) throw new SyncError('DAY_OCCUPIED');
          const details = [planNote(entry.result, eligibleFull),
            entry.result.week?.variation === 'prescription' ? t('coach.weekLimited') : undefined].filter(Boolean).join('\n') || undefined;
          const saved = await saveCoachPlan(entry.result, selectedCategory, restrictEquipment, details);
          await setWeekday(entry.weekday, saved.id);
          result.push({ ...entry, savedId: saved.id, scheduled: 'yes' as const });
        }
        return result;
      });
      setPlanDays(updated);
      setAllSaved(true);
    } catch (failure) {
      const code = failure instanceof SyncError ? failure.code : '';
      setError(t(code === 'DAY_OCCUPIED' ? 'coach.portOccupied' : code === 'STALE_PROPOSAL' ? 'coach.planStale' : 'ui.saveRoutineFailed'));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function toggleDay(wd: Weekday) {
    setTrainingDays((prev) => {
      const next = new Set(prev);
      if (next.has(wd)) { next.delete(wd); } else { next.add(wd); }
      return next;
    });
    resetMultiPreview();
  }

  const cardioControls = usesDedicatedCardio && (
              <div className="coach-plan-fields coach-cardio-fields">
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
            );

  return (
    <section className="card self-host-card" id="montar-treino">
      <h2>{t(mode === 'port' ? 'coach.portTitle' : 'coach.planTitle')}</h2>
      {mode !== 'port' && <p className="hint">{t('coach.plansRest')}</p>}

      {/* Mode toggle */}
      <div className="coach-plan-mode" role="group" aria-label={t('coach.planTitle')}>
        {(['reference', 'split', 'port'] as const).map((m) => (
          <label key={m} className={'coach-plan-mode-option' + (mode === m ? ' selected' : '')}>
            <input
              type="radio"
              name="coach-plan-mode"
              value={m}
              checked={mode === m} disabled={busy || readingReference}
              onChange={() => { setMode(m); setReference(undefined); onFileItems([]); setSourceDays({}); resetPreview(); }}
            />
            {t(m === 'reference' ? 'coach.planModeReference' : m === 'split' ? 'coach.planModeSplit' : 'coach.portTitle')}
          </label>
        ))}
      </div>

      {mode === 'port' && <PortablePlanImport catalog={exercises ?? []} />}
      {mode !== 'port' && <form onSubmit={(event) => { event.preventDefault(); if (mode === 'reference') void generate(); }}>
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
            <label><span id="coach-level-label">{t('coach.trainingLevel')}</span>
              <select aria-labelledby="coach-level-label" aria-describedby="coach-level-help" value={trainingLevel}
                onChange={(event) => { setTrainingLevel(event.target.value as TrainingLevel); resetPreview(); resetMultiPreview(); }}>
                {(['beginner', 'intermediate', 'advanced'] as const).map((value) => <option key={value} value={value}>
                  {t('coach.level.' + value, [trainingLevelCounts[value]])}
                </option>)}
              </select>
              <span className="hint" id="coach-level-help">{t('coach.levelHelp')}</span>
            </label>
            {mode === 'reference' && !multiMode && (
              <label><span id="coach-focus-label">{t('coach.focus')}</span><select aria-labelledby="coach-focus-label" value={focus}
                onChange={(event) => { setFocus(event.target.value as PlanFocus); resetPreview(); resetMultiPreview(); }}>
                {(['full', 'upper', 'lower'] as const).map((value) => <option key={value} value={value}>{t('coach.focus.' + value)}</option>)}
              </select></label>
            )}
            <label><span id="coach-duration-label">{t('coach.minutes')}</span><input type="number" required min={15} max={90} value={minutes || ''}
              aria-labelledby="coach-duration-label" aria-describedby="coach-duration-help"
              onChange={(event) => { setMinutes(Number(event.target.value)); resetPreview(); resetMultiPreview(); }} />
              <span className="hint" id="coach-duration-help">{t('coach.sessionDurationHelp')}</span></label>
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
            <fieldset className="coach-plan-inputs coach-schedule-card" disabled={busy}>
              <legend className="sr-only">{t('coach.sourceSchedule')}</legend>
              <div className="coach-schedule-heading">
                <div><span className="coach-step">01</span><h3 id="coach-source-days-title">{t('coach.trainingDays')}</h3></div>
                <span className="coach-day-count">{t(sourceWeekdays.size === 1 ? 'coach.oneDaySelected' : 'coach.daysSelected', [sourceWeekdays.size])}</span>
              </div>
              <p className="hint">{t('coach.chooseDaysHelp')}</p>
              <WeekdayPicker labelledBy="coach-source-days-title" selected={sourceWeekdays} onToggle={(day) => {
                setSourceDays((previous) => ({ ...previous, [day]: previous[day] ? undefined : { key: 'new' } }));
                resetPreview(); resetMultiPreview();
              }} />
              {sourceWeekdays.size === 0 && <p className="coach-schedule-empty">{t(dayItems.length ? 'coach.selectOneDay' : 'coach.noDaysHelp')}</p>}
            </fieldset>
            <CoachReferencePicker catalog={exercises ?? []} workouts={workouts ?? []} disabled={busy}
              reference={reference} onReading={setReadingReference}
              onChange={(value) => { setReference(value); resetPreview(); resetMultiPreview(); }}
              onItems={onFileItems} />
            {sourceWeekdays.size > 0 && <fieldset className="coach-plan-inputs coach-schedule-card" disabled={busy}>
              <legend className="sr-only">{t('coach.sourceSchedule')}</legend>
              <div className="coach-schedule-heading"><div><span className="coach-step">02</span>
                <h3>{t('coach.configureDays')}</h3></div></div>
              <p className="hint">{t('coach.configureDaysHelp')}</p>
              <div className="coach-day-cards">
                {WEEKDAY_ORDER.filter((day) => sourceDays[day]).map((weekday) => (
                  <div key={weekday} className="coach-day-card">
                    <h4>{t('wd.full.' + weekday)}</h4>
                    <label htmlFor={'coach-source-role-' + weekday}>{t('coach.dayRole')}
                      <select id={'coach-source-role-' + weekday} aria-label={t('coach.typeForDay', [t('wd.full.' + weekday)])}
                        value={sourceDays[weekday]?.role ?? ''} required
                        onChange={(event) => {
                          const role = (event.target.value || undefined) as DayRole | undefined;
                          setSourceDays((previous) => ({ ...previous, [weekday]: { ...previous[weekday]!, role } }));
                          resetMultiPreview();
                        }}>
                        <option value="">{t('coach.pickDayRole')}</option>
                        {dayRoles.map((role) => <option key={role} value={role}>{t('coach.role.' + role)}</option>)}
                      </select>
                    </label>
                    {dayItems.length > 0 && <label htmlFor={'coach-source-day-' + weekday}>{t('coach.dayReference')}
                      <select id={'coach-source-day-' + weekday} aria-label={t('coach.referenceForDay', [t('wd.full.' + weekday)])}
                        value={sourceDays[weekday]?.key ?? 'new'} onChange={(event) => {
                          const key = event.target.value;
                          setSourceDays((previous) => ({ ...previous, [weekday]: { ...previous[weekday]!, key } }));
                          resetMultiPreview();
                        }}>
                        <option value="new">{t('coach.newDay')}</option>
                        {dayItems.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </label>}
                  </div>
                ))}
              </div>
              {!allSourceRowsComplete && <p className="hint" role="status">{t('coach.completeDayTypes')}</p>}
            </fieldset>}
            {cardioControls}
            {!multiMode && <details>
              <summary>{t('coach.planInput', [options.length])}</summary>
              <p className="hint">{t('coach.planInputDetails')}</p>
              <ul className="self-host-list coach-plan-candidates">
                {options.map(({ id, name }) => <li key={id}>{name}</li>)}
              </ul>
            </details>}
            {destination && <p className="hint">{t('coach.destination', [destination])}</p>}
            {!multiMode && exercises && options.length < exerciseCount && <p className="hint">{t('coach.levelNeeds', [exerciseCount])}</p>}
            <div className="self-host-actions">
              {!multiMode && <button className="btn" disabled={!model || busy || readingReference || options.length < exerciseCount} type="submit">
                {t(external ? 'coach.sendPlan' : 'coach.generatePlan')}
              </button>}
              {multiMode && (
                <button className="btn" type="button"
                  disabled={busy || readingReference || !validMinutes || !allSourceRowsComplete || (usesDedicatedCardio && !validCardioMinutes) || !forSource.length || (!model && forSource.some(({ role }) => role !== 'cardio'))}
                  onClick={() => void generateWeek(forSource)}>
                  {t('coach.generateSplit')}
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
            <div className="coach-schedule-card">
              <div className="coach-schedule-heading">
                <h3 id="coach-split-days-title">{t('coach.trainingDays')}</h3>
                <span className="coach-day-count">{t(trainingDays.size === 1 ? 'coach.oneDaySelected' : 'coach.daysSelected', [trainingDays.size])}</span>
              </div>
              <p className="hint">{t('coach.splitDaysHelp')}</p>
              <WeekdayPicker labelledBy="coach-split-days-title" selected={trainingDays} onToggle={toggleDay} />
              {trainingDays.size === 0 && <p className="coach-schedule-empty" role="status">{t('coach.selectOneDay')}</p>}
            </div>
            <ol className="self-host-list coach-split-preview" aria-label={t('coach.weekPreview')}>
              {splitPreview.map(({ weekday, label }) => <li key={weekday}>
                <span>{t('wd.full.' + weekday)}</span><strong>{label}</strong>
              </li>)}
            </ol>
            <p className="hint">{t('coach.weekVariationHelp')}</p>
            {cardioControls}
            <div className="self-host-actions">
              <button className="btn" type="button"
                disabled={!model || busy || !validMinutes || (usesDedicatedCardio && !validCardioMinutes) || trainingDays.size === 0}
                onClick={() => void generateSplit()}>
                {t('coach.generateSplit')}
              </button>
            </div>
          </fieldset>
        )}
        {mode === 'split' && request.current && <button className="btn ghost" type="button" onClick={() => request.current?.abort()}>{t('tg.cancel')}</button>}
      </form>}

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
              <h3>{entry.weekday === undefined ? '' : t('wd.full.' + entry.weekday) + ' · '}{entry.label}</h3>
              {entry.error && !entry.result && (
                <p className="feedback error" role="alert">{entry.error}</p>
              )}
              {entry.result && (
                <>
                  <p>{entry.result.summary}</p>
                  {entry.result.week && entry.result.week.variation !== 'initial' && <p className="hint">
                    {t(entry.result.week.variation === 'exercises' ? 'coach.weekChanged' : 'coach.weekLimited')}
                  </p>}
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
                {scheduleConflict && <label className="coach-plan-inventory"><input type="checkbox" checked={replaceDays} disabled={busy}
                  onChange={(event) => setReplaceDays(event.target.checked)} /> {t('ui.replaceBusyDays')}</label>}
                <div className="self-host-actions">
                  <button className="btn" type="button"
                    disabled={busy || !selectedCategory || planDays.some(({ result }) => !result) || (scheduleConflict && !replaceDays)}
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
