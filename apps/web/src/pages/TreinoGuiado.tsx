// Página de treino guiado — sessão ativa.
// Rota: /treino  (wiring feito em App.tsx pelo caller)
// Fluxo: determina rotina → monta sessão → usuário marca séries → rest timer → grava.
//
// Features implementadas neste arquivo:
//   G2 — Supersets: exercícios com mesmo supersetGroup alternam sem rest entre si;
//        rest só dispara depois de completar todas as séries do round do grupo.
//   G3 — Work timer (modo time) + campos cardio (distanceM / speedKmh).
//   G8 — Detecção de PR ao marcar série e toast celebratório; prs gravados no WorkoutLog.

import '../styles/treino.css';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, X, Timer, Zap, Play, Square, Trophy, Plus, Trash2, ExternalLink } from 'lucide-react';

import {
  effectiveRoutine,
  nextPrescription,
  parseRepsRange,
  toISO,
  detectPRs,
  detectAllPRs,
  round1,
  computePlates,
  DEFAULT_BAR_KG,
  DEFAULT_PLATES_KG,
} from '@forja/core';
import type {
  Exercise,
  MainSet531,
  PR,
  Routine,
  RoutineExercise,
  SetLog,
  Unit,
  WorkoutLog,
} from '@forja/core';

import { db } from '../db/db';
import { getWeekPlan, listOverrides, getSettings } from '../db/repo';
import { useSessionStore } from '../store/session';
import type { ActiveExercise } from '../store/session';
import { useWakeLock } from '../lib/useWakeLock';
import { hasExerciseMedia, Media } from '../components/Media';
import { MuscleCoverage } from '../components/MuscleCoverage';
import { useT } from '../lib/i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formata segundos como "1:30" ou "0:45". */
function fmtSecs(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function buildActiveExercise(config: RoutineExercise, exercise: Exercise, workouts: WorkoutLog[], routineId: string): ActiveExercise {
  const prescription = nextPrescription({ workouts, config, routineId });
  const mainSets = prescription.mainSets;
  const isReps = exercise.mode === 'reps';
  const reps = isReps ? prescription.reps ?? (config.targetReps ? parseRepsRange(config.targetReps).min : undefined) : undefined;
  const sec = isReps ? undefined : prescription.sec ?? config.targetSec;
  const distanceM = exercise.mode === 'cardio' ? config.targetDistanceM : undefined;
  const speedKmh = exercise.mode === 'cardio' ? config.targetSpeedKmh : undefined;
  const weightKg = isReps && mainSets === undefined ? config.targetWeightKg ?? prescription.weightKg : undefined;
  const count = mainSets?.length ?? config.sets;
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    mode: exercise.mode,
    restSec: config.restSec,
    targetSecMax: config.targetSecMax,
    note: config.note,
    supersetGroup: config.supersetGroup,
    prescription,
    target: {
      sets: count,
      policy: config.progression ?? 'off',
      reps: mainSets === undefined && reps !== undefined ? String(reps) : undefined,
      sec, distanceM, speedKmh, weightKg, mainSets,
      cycleWeek: prescription.cycleWeek,
      baseTrainingMaxKg: config.trainingMaxKg,
      trainingMaxKg: prescription.trainingMaxKg,
    },
    sets: Array.from({ length: count }, (_, index) => ({
      reps: mainSets?.[index]?.reps ?? reps,
      weightKg: mainSets?.[index]?.weightKg ?? weightKg,
      sec, distanceM, speedKmh, done: false,
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers de superset
// ---------------------------------------------------------------------------

/**
 * Dado o índice de um exercício na rotina e a lista de configs, devolve os índices
 * de todos os exercícios do mesmo supersetGroup (incluindo o próprio).
 * Se o exercício não tem supersetGroup, devolve apenas [exIndex].
 */
function getSupersetGroup(exercises: Pick<RoutineExercise, 'supersetGroup'>[], exIndex: number): number[] {
  const cfg = exercises[exIndex];
  if (cfg === undefined || cfg.supersetGroup === undefined) return [exIndex];
  const group = cfg.supersetGroup;
  return exercises
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.supersetGroup === group)
    .map(({ i }) => i);
}

/**
 * Para um dado exercício (exIndex) e número de série (setIndex), verifica se
 * todos os exercícios do mesmo supersetGroup já completaram a série de número setIndex.
 * Se sim, é hora do descanso.
 */
function isRoundComplete(
  exercises: ActiveExercise[],
  routineExercises: Pick<RoutineExercise, 'supersetGroup'>[],
  exIndex: number,
  setIndex: number,
): boolean {
  const groupIndices = getSupersetGroup(routineExercises, exIndex);
  if (groupIndices.length <= 1) return true; // sem superset → sempre dispara rest

  return groupIndices.every((gi) => {
    const ex = exercises[gi];
    if (ex === undefined) return true;
    const set = ex.sets[setIndex];
    return set === undefined || set.done;
  });
}

/**
 * Dado que acabamos de concluir a série setIndex do exercício exIndex (superset),
 * devolve o índice do próximo exercício do grupo que ainda não concluiu essa série.
 * Se todos já concluíram, devolve null (hora do rest).
 */
function nextInSuperset(
  exercises: ActiveExercise[],
  routineExercises: Pick<RoutineExercise, 'supersetGroup'>[],
  exIndex: number,
  setIndex: number,
): number | null {
  const groupIndices = getSupersetGroup(routineExercises, exIndex);
  if (groupIndices.length <= 1) return null;

  // Próximo no grupo (após o atual) que ainda não fez esta série
  const posInGroup = groupIndices.indexOf(exIndex);
  for (let offset = 1; offset < groupIndices.length; offset++) {
    const nextPos = (posInGroup + offset) % groupIndices.length;
    const nextIdx = groupIndices[nextPos];
    if (nextIdx === undefined) continue;
    const ex = exercises[nextIdx];
    if (ex === undefined) continue;
    const set = ex.sets[setIndex];
    if (set !== undefined && !set.done) return nextIdx;
  }
  return null; // todos já fizeram — round completo
}

/** Label de superset para exibição (ex.: "Superset A"). */
function supersetLabel(supersetGroup: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letter = letters[(supersetGroup - 1) % 26] ?? String(supersetGroup);
  return `Superset ${letter}`;
}

// ---------------------------------------------------------------------------
// Helpers de PR
// ---------------------------------------------------------------------------

/**
 * Calcula o melhor 1RM e a maior carga já registrados para um exercício
 * a partir de todos os workouts do histórico. Usado para detecção inline.
 */
function PRToast({ pr, exerciseName }: { pr: PR; exerciseName: string }) {
  const label =
    pr.kind === '1rm'
      ? `1RM ${round1(pr.value)} kg`
      : pr.kind === 'weight'
        ? `${round1(pr.value)} kg`
        : `${pr.value} reps`;

  return (
    <motion.div
      className="tg-pr-toast"
      initial={{ opacity: 0, y: -24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.95 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <Trophy size={18} />
      <span>
        PR! {exerciseName} — {label}
      </span>
    </motion.div>
  );
}

/** Timer de descanso exibido junto às séries. */
function RestTimer({
  endsAt,
  onSkip,
  onComplete,
}: {
  endsAt: number;
  onSkip: () => void;
  onComplete: () => void;
}) {
  const t = useT();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, (endsAt - Date.now()) / 1000),
  );
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    const id = setInterval(() => {
      const r = (endsAt - Date.now()) / 1000;
      if (r <= 0) {
        setRemaining(0);
        clearInterval(id);
        try { navigator.vibrate?.(200); } catch { /* sem suporte */ }
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.4);
        } catch { /* sem suporte a WebAudio */ }
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      } else {
        setRemaining(r);
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  const urgent = remaining <= 5;

  return (
    <div className="tg-rest-panel">
      <div className="tg-rest-time">
        <span>{t('tg.rest')}</span>
        <span className={`tg-rest-countdown${urgent ? ' urgent' : ''}`} role="timer" aria-label={t('tg.rest')}>
          {fmtSecs(remaining)}
        </span>
      </div>
      <button type="button" className="btn ghost" onClick={onSkip}>{t('tg.skipRest')}</button>
    </div>
  );
}

/** Work timer inline — cronômetro crescente para série no modo time/cardio. */
function WorkTimerDisplay({
  startedAt,
  targetSec,
  onStop,
}: {
  startedAt: number;
  targetSec?: number;
  onStop: (elapsedSec: number) => void;
}) {
  const t = useT();
  const [elapsed, setElapsed] = useState(() => (Date.now() - startedAt) / 1000);
  const alertedRef = useRef(false);

  useEffect(() => {
    alertedRef.current = false;
    const id = setInterval(() => {
      const e = (Date.now() - startedAt) / 1000;
      setElapsed(e);

      // Aviso sonoro + vibração ao atingir o alvo (uma vez)
      if (targetSec !== undefined && e >= targetSec && !alertedRef.current) {
        alertedRef.current = true;
        try { navigator.vibrate?.(200); } catch { /* sem suporte */ }
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.2);
        } catch { /* sem suporte a WebAudio */ }
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  const overTarget = targetSec !== undefined && elapsed >= targetSec;

  return (
    <div className="tg-work-timer">
      <span className={`tg-work-timer-count${overTarget ? ' over' : ''}`}>
        {fmtSecs(elapsed)}
        {targetSec !== undefined && (
          <span className="tg-work-timer-target"> / {fmtSecs(targetSec)}</span>
        )}
      </span>
      <button
        className="tg-work-stop-btn"
        onClick={() => onStop(Math.round(elapsed))}
        aria-label={t("tg.stopAriaLabel")}
      >
        <Square size={16} fill="currentColor" />{t("tg.stop")}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente de série
// ---------------------------------------------------------------------------

interface SetRowProps {
  exIndex: number;
  setIndex: number;
  set: SetLog;
  isTime: boolean;
  isCardio: boolean;
  unit: Unit;
  disabled: boolean;
  timerBusy: boolean;
  trackEffort: boolean;
  workTimerSetIndex: number | null; // qual série está com work timer ativo
  onDone: (elapsed?: number) => void;
  onChange: (patch: Partial<SetLog>) => void;
  onStartWork?: (setIndex: number) => void;
  onStopWork?: (elapsedSec: number) => void;
  workStartedAt: number | null;
  targetSec?: number;
  warmup?: boolean;
}

function SetRow({
  exIndex: _exIndex,
  setIndex,
  set,
  isTime,
  isCardio,
  unit,
  disabled,
  timerBusy,
  trackEffort,
  workTimerSetIndex,
  onDone,
  onChange,
  onStartWork,
  onStopWork,
  workStartedAt,
  targetSec,
  warmup = false,
}: SetRowProps) {
  const t = useT();
  const repsRef = useRef<HTMLInputElement>(null);
  const isWorkActive = workTimerSetIndex === setIndex && workStartedAt !== null;
  const rowLabel = t(warmup ? 'tg.warmupRow' : 'tg.setRow', [setIndex + 1]);

  return (
    <fieldset className={`tg-set-wrap${set.done ? ' done' : ''}`} disabled={disabled} aria-label={rowLabel}>
      <div className="tg-set-row">
        <span className="tg-set-idx">{warmup && "A"}{setIndex + 1}</span>

        {/* Modo cardio: tempo + distância + velocidade */}
        {isCardio ? (
          <>
            <input
              ref={repsRef}
              className="tg-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={set.sec ?? ''}
              onChange={(e) => onChange({ sec: e.target.value === '' ? undefined : Number(e.target.value) })}
              aria-label={t('tg.timeRow', [rowLabel])}
              placeholder="seg"
            />
            {/* coluna kg reutilizada para distância */}
            <input
              className="tg-input"
              type="number"
              inputMode="decimal"
              min={0}
              step={10}
              value={set.distanceM ?? ''}
              onChange={(e) => onChange({ distanceM: e.target.value === '' ? undefined : Number(e.target.value) })}
              aria-label={t('tg.distanceRow', [rowLabel])}
              placeholder="m"
            />
          </>
        ) : isTime ? (
          <>
            <input
              ref={repsRef}
              className="tg-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={set.sec ?? ''}
              onChange={(e) => onChange({ sec: e.target.value === '' ? undefined : Number(e.target.value) })}
              aria-label={t('tg.timeRow', [rowLabel])}
            />
            {/* ocupa coluna de peso no modo time para manter o grid alinhado */}
            <span />
          </>
        ) : (
          <>
            <input
              ref={repsRef}
              className="tg-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={set.reps ?? ''}
              onChange={(e) => onChange({ reps: e.target.value === '' ? undefined : Number(e.target.value) })}
              aria-label={t('tg.repsRow', [rowLabel])}
            />
            <input
              className="tg-input"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={set.weightKg === undefined ? '' : unit === 'lb' ? Number((set.weightKg * KG_TO_LB).toFixed(4)) : set.weightKg}
              onChange={(event) => {
                const value = event.target.value === '' ? undefined : event.target.valueAsNumber;
                onChange({ weightKg: value === undefined || !Number.isFinite(value) ? undefined : unit === 'lb' ? value / KG_TO_LB : value });
              }}
              aria-label={t('tg.weightRow', [rowLabel, unit])}
            />
          </>
        )}

        {/* Botão play (time/cardio) ou check (reps) */}
        {(isTime || isCardio) && !set.done ? (
          <button
            className={`tg-work-btn${isWorkActive ? ' active' : ''}`}
            onClick={() => isWorkActive ? undefined : onStartWork?.(setIndex)}
            aria-label={isWorkActive ? t('tg.setActive') : t('tg.startSet')}
            disabled={timerBusy}
          >
            <Play size={18} strokeWidth={2.4} />
          </button>
        ) : (
          <button
            className={`tg-done-btn${set.done ? ' done' : ''}`}
            onClick={() => onDone()}
            aria-label={warmup
              ? set.done ? t('tg.uncheckWarmup') : t('tg.checkWarmup')
              : set.done ? t('tg.uncheckSet') : t('tg.checkSet')}
            aria-pressed={set.done}
          >
            <Check size={20} strokeWidth={2.6} />
          </button>
        )}
      </div>

      {/* Work timer ativo para esta série */}
      {(isTime || isCardio) && !set.done && !timerBusy && (
        <button className="tg-manual-done" type="button" onClick={() => onDone()} disabled={set.sec === undefined}>{t("ui.recordTime")}</button>
      )}
      {isWorkActive && workStartedAt !== null && (
        <WorkTimerDisplay
          startedAt={workStartedAt}
          targetSec={targetSec}
          onStop={(elapsed) => {
            onStopWork?.(elapsed);
            onChange({ sec: elapsed });
            onDone(elapsed);
          }}
        />
      )}

      {/* Campo velocidade (cardio) — linha extra */}
      {isCardio && (
        <div className="tg-cardio-extra">
          <span className="tg-cardio-label">km/h</span>
          <input
            className="tg-input tg-input-sm"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            value={set.speedKmh ?? ''}
            onChange={(e) => onChange({ speedKmh: e.target.value === '' ? undefined : Number(e.target.value) })}
            aria-label={t('tg.speedRow', [rowLabel])}
            placeholder="—"
          />
        </div>
      )}

      {/* Campo RIR — só aparece quando trackEffort está ativo e não é cardio/time */}
      {trackEffort && !isTime && !isCardio && (
        <div className="tg-rir-row">
          <span className="tg-rir-label">RIR</span>
          <input
            className="tg-rir-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={10}
            placeholder="—"
            value={set.effort?.rir ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Math.min(10, Math.max(0, Number(e.target.value)));
              onChange({ effort: { ...set.effort, rir: val } });
            }}
            aria-label={t('tg.rirRow', [rowLabel])}
          />
          <span className="tg-rir-hint">{t("tg.rirHint")}</span>
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: calculadora de anilhas (G15)
// ---------------------------------------------------------------------------

/** Fator de conversão kg → lb. */
const KG_TO_LB = 1 / 0.45359237;

interface PlateCalcProps {
  /** Carga atual da série (pode ser undefined quando o campo está vazio). */
  weightKg: number | undefined;
  unit: Unit;
}

/**
 * Widget compacto: mostra as anilhas por lado para o peso alvo.
 * Barra padrão 20 kg (44 lb), anilhas padrão do DEFAULT_PLATES_KG.
 * Aparece apenas no modo reps quando há peso definido.
 */
function PlateCalc({ weightKg, unit }: PlateCalcProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [barKg, setBarKg] = useState(DEFAULT_BAR_KG);

  // Nenhum peso definido → nada a mostrar
  if (weightKg === undefined || weightKg <= 0) return null;

  // Converte para a unidade de exibição
  const displayWeight = unit === 'lb' ? weightKg * KG_TO_LB : weightKg;
  const displayBar    = unit === 'lb' ? barKg * KG_TO_LB : barKg;
  const unitLabel     = unit === 'lb' ? 'lb' : 'kg';

  // Cálculo sempre em kg internamente
  const result = computePlates(weightKg, barKg, DEFAULT_PLATES_KG);

  // Formata número: remove .0 desnecessário
  function fmt(n: number): string {
    const v = unit === 'lb' ? n * KG_TO_LB : n;
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  }

  return (
    <div className="tg-plate-calc">
      <button
        className="tg-plate-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("tg.platesAriaLabel")}
      >
        🏋 Anilhas — {fmt(displayWeight)} {unitLabel}
        <span className="tg-plate-toggle-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="tg-plate-body">
          {/* Seletor de barra */}
          <div className="tg-plate-bar-row">
            <span className="tg-plate-label">{t("tg.barLabel")}</span>
            <select
              className="tg-plate-select"
              value={barKg}
              onChange={(e) => setBarKg(Number(e.target.value))}
              aria-label={t("tg.barAriaLabel")}
            >
              <option value={20}>20 kg{unit === 'lb' ? ' (44 lb)' : ''}</option>
              <option value={15}>15 kg{unit === 'lb' ? ' (33 lb)' : ''}</option>
              <option value={10}>10 kg{unit === 'lb' ? ' (22 lb)' : ''}</option>
            </select>
          </div>

          {/* Resultado */}
          {weightKg <= barKg ? (
            <p className="tg-plate-info">
              Alvo ≤ barra ({fmt(displayBar)} {unitLabel}) — sem anilhas necessárias.
            </p>
          ) : result.perSide.length === 0 ? (
            <p className="tg-plate-info">{t("tg.platesNone")}</p>
          ) : (
            <>
              <div className="tg-plate-result">
                <span className="tg-plate-label">{t("tg.perSide")}</span>
                <div className="tg-plate-chips">
                  {result.perSide.map((p, i) => (
                    <span key={i} className="tg-plate-chip">
                      {fmt(p)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="tg-plate-achievable">{t("tg.achievable")} <strong>{fmt(result.achievableKg)} {unitLabel}</strong>
                {result.leftover > 0 && (
                  <span className="tg-plate-leftover">
                    {' '}(faltam {fmt(result.leftover)} {unitLabel})
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------

export function TreinoGuiado() {
  useWakeLock();
  const t = useT();
  const guideId = useId();
  const guideRef = useRef<HTMLDetailsElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routineIdParam = searchParams.get('routineId');

  const { active, saving, start, logSet, toggleSetDone, addWarmup, logWarmup, removeWarmup, goToExercise, startRest, stopRest, startWork, stopWork, cancel, finish } =
    useSessionStore();

  // Dados do banco (leitura reativa)
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const exercisesMap = useLiveQuery(
    () => db.exercises.toArray().then((arr) => {
      const m = new Map<string, Exercise>();
      for (const ex of arr) m.set(ex.id, ex);
      return m;
    }),
    [],
  );

  const routinesMap = useLiveQuery(
    () => db.routines.toArray().then((arr) => {
      const m = new Map<string, Routine>();
      for (const r of arr) m.set(r.id, r);
      return m;
    }),
    [],
  );

  // Settings reativas
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const trackEffort = settings?.trackEffort ?? false;
  const unit: Unit = settings?.unit ?? 'kg';

  const defaultRestSecRef = useRef<number>(90);
  if (settings !== undefined) {
    defaultRestSecRef.current = settings.defaultRestSec;
  }

  // Estado de inicialização da sessão
  const [initDone, setInitDone] = useState(false);
  const [todayRoutineId, setTodayRoutineId] = useState<string | 'rest' | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const [finishError, setFinishError] = useState<string | null>(null);
  const initializing = useRef(false);
  const work = active?.work;
  const [restAnnouncement, setRestAnnouncement] = useState('');

  // ---- G8: PRs detectados — toasts ----
  // Lista de PRs pendentes para exibir. Exibimos um de cada vez, 2.5s cada.
  const [prQueue, setPrQueue] = useState<{ pr: PR; exerciseName: string }[]>([]);
  // Uma celebração por exercício e tipo nesta sessão.
  const prToastedRef = useRef<Set<string>>(new Set());

  // Exibe o primeiro toast da fila e remove após 2.5s
  useEffect(() => {
    if (prQueue.length === 0) return;
    const timer = setTimeout(() => {
      setPrQueue((q) => q.slice(1));
    }, 2500);
    return () => clearTimeout(timer);
  }, [prQueue]);

  // Determina a rotina e inicia a sessão (uma vez, quando os dados do db chegarem)
  useEffect(() => {
    if (initDone || initializing.current) return;
    if (workouts === undefined || exercisesMap === undefined || routinesMap === undefined) return;
    initializing.current = true;

    void (async () => {
      try {
        if (active !== null) {
          setInitDone(true);
          return;
        }

        const today = toISO(new Date());

        let resolvedId: string | 'rest' | null = null;

        if (routineIdParam !== null) {
          resolvedId = routineIdParam;
        } else {
          const [weekPlan, overrides] = await Promise.all([getWeekPlan(), listOverrides()]);
          resolvedId = effectiveRoutine(today, weekPlan, overrides);
        }

        setTodayRoutineId(resolvedId);

        if (resolvedId === null || resolvedId === 'rest') {
          setInitDone(true);
          return;
        }

        const routine = routinesMap.get(resolvedId);
        if (routine === undefined) {
          setInitError(t('tg.missingRoutine', [resolvedId]));
          setInitDone(true);
          return;
        }

        if (routine.exercises.length === 0) throw new Error(t('tg.emptyRoutine'));
        const exercises = routine.exercises.map((cfg) => {
          const exercise = exercisesMap.get(cfg.exerciseId);
          if (exercise === undefined) throw new Error(t('tg.missingExercise'));
          return buildActiveExercise(cfg, exercise, workouts, routine.id);
        });

        const fetchedSettings = await getSettings();

        start({
          dateISO: today,
          routineId: routine.id,
          routineName: routine.name,
          categoryId: routine.categoryId,
          exercises,
        });

        defaultRestSecRef.current = fetchedSettings.defaultRestSec;
        setInitDone(true);
      } catch (err) {
        setInitError(err instanceof Error ? err.message : t('tg.initFailed'));
        setInitDone(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercisesMap, routinesMap, workouts, initDone]);

  // ---- Handlers ----

  /**
   * Detecta PR para uma série recém-marcada como done.
   * Compara apenas com workouts já finalizados (histórico anterior — não a sessão atual).
   * Enfileira toast se for o primeiro PR do exercício na sessão.
   */
  const checkForPR = useCallback(
    (exIndex: number, setIndex: number) => {
      if (active === null || workouts === undefined) return;
      const ex = active.exercises[exIndex];
      if (ex === undefined) return;

      const set = ex.sets[setIndex];
      if (set === undefined) return;
      const exerciseName = ex.name ?? exercisesMap?.get(ex.exerciseId)?.name ?? ex.exerciseId;
      const records = detectPRs({ ...ex, sets: [{ ...set, done: true }] }, workouts);
      for (const pr of records) {
        if (pr.kind === 'reps') continue;
        const key = `${pr.exerciseId}-${pr.kind}`;
        if (prToastedRef.current.has(key)) continue;
        prToastedRef.current.add(key);
        setPrQueue((queue) => [...queue, { pr, exerciseName }]);
      }
    },
    [active, workouts, exercisesMap],
  );

  function handleToggleDone(exIndex: number, setIndex: number, elapsed?: number) {
    if (active === null || saving) return;

    const ex = active.exercises[exIndex];
    const set = ex?.sets[setIndex];
    if (set === undefined) return;

    const wasNotDone = !set.done;
    const exercise = exercisesMap?.get(ex?.exerciseId ?? '');
    const mode = ex?.mode ?? exercise?.mode;
    if (wasNotDone && (mode === 'time' || mode === 'cardio'
      ? (elapsed ?? set.sec ?? 0) <= 0 || (set.distanceM ?? 0) < 0 || (set.speedKmh ?? 0) < 0
      : !Number.isInteger(set.reps) || (set.reps ?? 0) <= 0 || (set.weightKg ?? 0) < 0)) {
      setFinishError(t('tg.badValues'));
      return;
    }
    setFinishError(null);
    setRestAnnouncement('');
    toggleSetDone(exIndex, setIndex);

    if (!wasNotDone) return; // estava done → desmarcou, nada mais

    // Cancela work timer se estava rodando para esta série
    if (work?.exerciseIndex === exIndex && work.setIndex === setIndex) stopWork();
    checkForPR(exIndex, setIndex);

    // ---- G2: lógica de superset ----
    const routine = active.routineId !== undefined ? routinesMap?.get(active.routineId) : undefined;
    const routineExercises = active.exercises.map((item, index) => ({
      supersetGroup: item.mode === undefined ? routine?.exercises[index]?.supersetGroup : item.supersetGroup,
      restSec: item.restSec ?? (item.mode === undefined ? routine?.exercises[index]?.restSec : undefined),
    }));

    const cfg = routineExercises[exIndex];
    const isInSuperset = cfg !== undefined && cfg.supersetGroup !== undefined;

    if (isInSuperset) {
      // Verifica se existe próximo exercício do grupo que ainda não fez esta série
      // Recalcula com o estado local atualizado (marca o set atual como done para a verificação)
      const updatedExercises = active.exercises.map((e, ei) => {
        if (ei !== exIndex) return e;
        return {
          ...e,
          sets: e.sets.map((s, si) =>
            si === setIndex ? { ...s, done: true } : s,
          ),
        };
      });

      const nextIdx = nextInSuperset(updatedExercises, routineExercises, exIndex, setIndex);

      if (nextIdx !== null) {
        // Navega para o próximo exercício do grupo (sem rest)
        goToExercise(nextIdx);
        return;
      }

      // Todos do grupo concluíram esta série → verifica se o round está completo
      const roundComplete = isRoundComplete(updatedExercises, routineExercises, exIndex, setIndex);
      if (roundComplete) {
        const effectiveRest = cfg.restSec ?? defaultRestSecRef.current;
        if (effectiveRest > 0) startRest(effectiveRest);
      }
      return;
    }

    // ---- Comportamento padrão (sem superset) ----
    const effectiveRest = cfg?.restSec ?? defaultRestSecRef.current;
    if (effectiveRest > 0) startRest(effectiveRest);
  }

  async function handleFinish() {
    if (useSessionStore.getState().saving) return;
    if (!active?.exercises.some((exercise) => exercise.sets.some((set) => set.done))) {
      setFinishError(t('tg.needSet'));
      return;
    }
    if (active.work !== undefined) {
      setFinishError(t('tg.stopBeforeFinish'));
      return;
    }
    setFinishError(null);
    try {
      const records = detectAllPRs(active.exercises, workouts ?? []).filter((pr) => pr.kind !== 'reps');
      await finish(records);
      navigate('/historico');
    } catch {
      setFinishError(t('tg.finishFailed'));
    }
  }

  function handleCancel() {
    if (!window.confirm(t('tg.cancelConfirm'))) return;
    cancel();
    navigate('/');
  }

  // ---- G3: Work timer handlers ----
  function handleStartWork(exIndex: number, setIndex: number) {
    startWork(exIndex, setIndex);
  }

  function handleStopWork(_elapsedSec: number) {
    stopWork();
  }

  // ---- Guard: aguarda inicialização ----
  if (!initDone) {
    return (
      <div className="tg-empty">
        <Zap size={36} color="var(--flame)" strokeWidth={2} />
        <h2>{t("tg.loading")}</h2>
      </div>
    );
  }

  // ---- Sem treino hoje ----
  if (active === null && initError === null && (todayRoutineId === 'rest' || todayRoutineId === null)) {
    return (
      <div className="tg-empty">
        <Timer size={36} color="var(--text-muted)" strokeWidth={1.5} />
        <h2>{t("tg.restDay")}</h2>
        <p>{t("tg.noWorkout")}</p>
        <button className="btn ghost" onClick={() => navigate('/treinos')}>{t("tg.seeRoutines")}</button>
      </div>
    );
  }

  // ---- Erro de inicialização ----
  if (active === null && initError !== null) {
    return (
      <div className="tg-empty">
        <X size={36} color="var(--danger)" strokeWidth={2} />
        <h2>{t("tg.error")}</h2>
        <p>{initError}</p>
        <button className="btn ghost" onClick={() => navigate('/')}>{t("tg.back")}</button>
      </div>
    );
  }

  if (active === null) return null;

  const currentEx = active.exercises[active.currentIndex];
  if (currentEx === undefined) return null;

  const exData = exercisesMap?.get(currentEx.exerciseId);
  const exName = currentEx.name ?? exData?.name ?? currentEx.exerciseId;
  const mode = currentEx.mode ?? exData?.mode;
  const isCardio = mode === 'cardio';
  const isTime = mode === 'time';
  const isTimedMode = isTime || isCardio;
  const totalExercises = active.exercises.length;

  const routine = active.routineId !== undefined ? routinesMap?.get(active.routineId) : undefined;
  const prescription = currentEx.prescription;

  // ---- G2: informações de superset ----
  const routineExercises = active.exercises.map((item, index) => ({
    supersetGroup: item.mode === undefined ? routine?.exercises[index]?.supersetGroup : item.supersetGroup,
  }));
  const supersetGroupIndices = getSupersetGroup(routineExercises, active.currentIndex);
  const isInSuperset = supersetGroupIndices.length > 1;
  const supersetGroupNum = routineExercises[active.currentIndex]?.supersetGroup;

  // Calcula o round atual do superset (quantas séries completas o primeiro do grupo já tem)
  const firstGroupIdx = supersetGroupIndices[0] ?? active.currentIndex;
  const firstGroupEx = active.exercises[firstGroupIdx];
  const roundsDone = firstGroupEx?.sets.filter((s) => s.done).length ?? 0;
  const totalRounds = currentEx.target.sets;

  const restActive = active.rest.endsAt !== null && active.rest.endsAt > Date.now();

  // Work timer ativo para o exercício atual
  const activeWorkSetIndex = work?.exerciseIndex === active.currentIndex ? work.setIndex : null;

  const completedSets = active.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.done).length, 0);
  const hasDemo = exData !== undefined && hasExerciseMedia(exData.id, exData.demo);
  const videoSearch = new URL('https://www.youtube.com/results');
  videoSearch.searchParams.set('search_query', `${exName} ${t('tg.videoQueryTerm')}`);

  function toggleGuide() {
    setGuideOpen(!guideOpen);
    if (!guideOpen) guideRef.current?.querySelector('summary')?.focus();
  }
  const plannedSets = active.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
  const canChangeExercise = !saving && !restActive && work === undefined;

  return (
    <div className="training-session">
      {/* Toast de PR — acima do rest overlay (z-index maior) */}
      <AnimatePresence>
        {prQueue[0] !== undefined && (
          <PRToast
            key={`${prQueue[0].pr.exerciseId}-${prQueue[0].pr.kind}`}
            pr={prQueue[0].pr}
            exerciseName={prQueue[0].exerciseName}
          />
        )}
      </AnimatePresence>

      <p className="sr-only" role="status">{restAnnouncement}</p>
      {/* Topbar */}
      <header className="tg-topbar">
        <div>
          <p className="session-label">{t("home.ongoing")}</p>
          <h1 className="tg-title">{active.routineName ?? routine?.name ?? 'Treino livre'}</h1>
        </div>
        <div className="session-tally">
          <span>{completedSets} de {plannedSets} séries</span>
          <progress aria-label={t("ui.completedInSession")} value={completedSets} max={Math.max(1, plannedSets)} />
        </div>
      </header>

      <div className="session-layout">
        <section className="session-log" aria-labelledby="current-exercise-title">
        <div className="tg-ex-card">
          {/* Badge de superset */}
          {isInSuperset && supersetGroupNum !== undefined && (
            <div className="tg-superset-badge">
              {supersetLabel(supersetGroupNum)}
              <span className="tg-superset-round">
                {' '}— Round {Math.min(roundsDone + 1, totalRounds)} de {totalRounds}
              </span>
            </div>
          )}

          <p className="session-label">{t("ui.exercise")} {active.currentIndex + 1} de {totalExercises}</p>
          <div className="session-exercise-heading">
            <h2 className="tg-ex-name" id="current-exercise-title">{exName}</h2>
            <button type="button" className="btn ghost session-guide-trigger" onClick={toggleGuide}
              aria-controls={guideId} aria-expanded={guideOpen}>
              {t('tg.exerciseGuide')}
            </button>
          </div>
          <div className="tg-ex-meta">
            {currentEx.target.sets} série{currentEx.target.sets !== 1 ? 's' : ''}
            {isTimedMode
              ? currentEx.target.sec !== undefined
                ? ` · ${currentEx.target.sec}${currentEx.targetSecMax !== undefined ? `–${currentEx.targetSecMax}` : ''} s`
                : ''
              : currentEx.target.reps !== undefined
                ? ` · ${currentEx.target.reps} reps`
                : ''}
            {currentEx.target.weightKg !== undefined
              ? ` · ${unit === 'lb' ? round1(currentEx.target.weightKg * KG_TO_LB) : currentEx.target.weightKg} ${unit}`
              : ''}
            {isCardio && currentEx.target.distanceM !== undefined
              ? ` · ${currentEx.target.distanceM}m`
              : ''}
            {isCardio && currentEx.target.speedKmh !== undefined
              ? ` · ${currentEx.target.speedKmh}km/h`
              : ''}
          </div>

          {currentEx.note && <p className="hint">{currentEx.note}</p>}

          {/* Dica discreta de prescrição */}
          {prescription !== undefined && <p className="tg-why">{prescription.reason
              ? t(`reason.${prescription.reason.key}`, prescription.reason.args?.map((value) =>
                  new Intl.NumberFormat(settings?.lang === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: 2 }).format(value)))
              : prescription.why}</p>}

          {/* Sets principais do 5/3/1 — guia visual de %, carga e reps */}
          {prescription?.kind === '531' && prescription.mainSets !== undefined && (
            <div className="tg-531-sets">
              {prescription.mainSets.map((ms: MainSet531, i: number) => {
                const displayW = unit === 'lb' ? (ms.weightKg * 2.20462).toFixed(1) : ms.weightKg.toFixed(1);
                const unitLabel = unit === 'lb' ? 'lb' : 'kg';
                return (
                  <div key={i} className={`tg-531-set${ms.amrap ? ' tg-531-set--amrap' : ''}`}>
                    <span className="tg-531-pct">{ms.percentOfTM}%</span>
                    <span className="tg-531-weight">{displayW} {unitLabel}</span>
                    <span className="tg-531-reps">
                      {ms.reps} rep{ms.reps !== 1 ? 's' : ''}
                      {ms.amrap ? <span className="tg-531-amrap-badge"> AMRAP</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!isTimedMode && (
            <section className="tg-warmups" aria-label={t("hist.warmups")}>
              {(currentEx.warmupSets ?? []).map((set, index) => (
                <div className="tg-warmup-row" key={index}>
                  <SetRow
                    exIndex={active.currentIndex}
                    setIndex={index}
                    set={set}
                    warmup
                    unit={unit}
                    isTime={false}
                    isCardio={false}
                    disabled={saving || restActive}
                    timerBusy={false}
                    trackEffort={false}
                    workTimerSetIndex={null}
                    workStartedAt={null}
                    onChange={(patch) => logWarmup(active.currentIndex, index, patch)}
                    onDone={() => {
                      if (!set.done && (!Number.isInteger(set.reps) || (set.reps ?? 0) <= 0 || (set.weightKg ?? 0) < 0)) {
                        setFinishError(t('tg.badWarmup'));
                        return;
                      }
                      setFinishError(null);
                      logWarmup(active.currentIndex, index, { done: !set.done });
                    }}
                  />
                  <button type="button" className="tg-warmup-remove" disabled={saving || restActive}
                    onClick={() => removeWarmup(active.currentIndex, index)} aria-label={t('tg.removeWarmup', [index + 1])}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button type="button" className="tg-warmup-add" disabled={saving || restActive}
                onClick={() => addWarmup(active.currentIndex)}><Plus size={17} />{t("ui.addWarmup")}</button>
            </section>
          )}

          {/* Labels de coluna */}
          <div className="tg-col-labels">
            <span />
            <span className="tg-col-label">{isTimedMode ? t("ui.seconds") : t("mode.reps")}</span>
            <span className="tg-col-label">{isCardio ? t("re.distance") : isTime ? '' : `Carga (${unit})`}</span>
            <span className="tg-col-label"><span className="sr-only">{t("ui.finishSet")}</span></span>
          </div>

          {/* Séries */}
          <div className="tg-sets">
            {currentEx.sets.map((set, si) => (
              <SetRow
                key={si}
                exIndex={active.currentIndex}
                setIndex={si}
                set={set}
                isTime={isTime}
                isCardio={isCardio}
                unit={unit}
                disabled={saving || restActive}
                timerBusy={work !== undefined}
                trackEffort={trackEffort}
                workTimerSetIndex={activeWorkSetIndex}
                workStartedAt={
                  activeWorkSetIndex === si ? (work?.startedAt ?? null) : null
                }
                targetSec={currentEx.target.sec}
                onDone={(elapsed) => handleToggleDone(active.currentIndex, si, elapsed)}
                onChange={(patch) => logSet(active.currentIndex, si, patch)}
                onStartWork={(setIdx) => handleStartWork(active.currentIndex, setIdx)}
                onStopWork={handleStopWork}
              />
            ))}
          </div>

          {active.rest.endsAt !== null && (
            <RestTimer key={active.rest.endsAt} endsAt={active.rest.endsAt} onSkip={stopRest}
              onComplete={() => { stopRest(); setRestAnnouncement(t('tg.restComplete')); }} />
          )}

          {/* Calculadora de anilhas (G15) — só no modo reps com peso */}
          {!isTimedMode && (
            <PlateCalc
              weightKg={currentEx.sets[0]?.weightKg}
              unit={unit}
            />
          )}
        </div>

        {finishError !== null && <p className="feedback error" role="alert">{finishError}</p>}

        {/* Navegação entre exercícios */}
        <div className="tg-ex-nav">
          <button
            className="btn ghost"
            disabled={saving || restActive || work !== undefined || active.currentIndex === 0}
            onClick={() => goToExercise(active.currentIndex - 1)}
            aria-label={t("tg.prevEx")}
          >
            <ChevronLeft size={18} />{t("tg.prev")}</button>
          {active.currentIndex < totalExercises - 1 ? (
            <button
              className="btn"
              disabled={saving || restActive || work !== undefined}
              onClick={() => goToExercise(active.currentIndex + 1)}
              aria-label={t("tg.nextEx")}
            >{t("tg.next")}<ChevronRight size={18} />
            </button>
          ) : (
            <button
              className="btn"
              disabled={saving || restActive}
              onClick={() => void handleFinish()}
              aria-label={t("tg.finishWorkout")}
            >
              {saving ? t("prog.measureSaving") : t("tg.finish")}
              <Check size={18} />
            </button>
          )}
        </div>

        {/* Rodapé */}
        <div className="tg-footer">
          <button
            className="btn ghost"
            disabled={saving || restActive}
            onClick={handleCancel}
            aria-label={t("tg.cancelAriaLabel")}
          >
            <X size={16} />{t("tg.cancel")}</button>
          {active.currentIndex < totalExercises - 1 && (
            <button
              className="btn"
              disabled={saving || restActive}
              onClick={() => void handleFinish()}
              aria-label={t("tg.finishNowAriaLabel")}
            >
              <Check size={16} />
              {saving ? t("prog.measureSaving") : t("tg.finishWorkout")}
            </button>
          )}
        </div>
        </section>

        <aside className="session-sidebar" aria-label={t("ui.sessionGuide")}>
          <details id={guideId} ref={guideRef} className="session-guide card" open={guideOpen}
            onToggle={(event) => setGuideOpen(event.currentTarget.open)}>
            <summary>{t('tg.exerciseGuide')}</summary>
            {guideOpen && (
              <div className="session-guide-body">
                <h3>{exName}</h3>
                {hasDemo && exData
                  ? <Media exerciseId={exData.id} demo={exData.demo} name={exName} size="lg" />
                  : <p className="hint">{t('tg.noExerciseMedia')}</p>}
                <a className="btn ghost session-video-link" href={videoSearch.href}
                  target="_blank" rel="noopener noreferrer" aria-label={t('tg.videoSearchHint')}>
                  {t('tg.videoSearch')} <ExternalLink size={15} aria-hidden="true" />
                </a>
                <section className="session-guide-muscles" aria-label={t('tg.musclesInvolved')}>
                  <h3>{t('tg.musclesInvolved')}</h3>
                  {exData
                    ? <MuscleCoverage figure={settings?.muscleFigure}
                        primary={[exData.primaryMuscle]} secondary={exData.secondaryMuscles} />
                    : <p className="hint">{t('tg.noExerciseMuscles')}</p>}
                </section>
              </div>
            )}
          </details>
        <details className="session-exercises card" open>
          <summary>{t("ui.sessionExercises")}</summary>
          <ol>
            {active.exercises.map((item, index) => {
              const done = item.sets.filter((set) => set.done).length;
              const name = item.name ?? exercisesMap?.get(item.exerciseId)?.name ?? item.exerciseId;
              return (
                <li key={`${item.exerciseId}-${index}`}>
                  <button
                    type="button"
                    onClick={() => goToExercise(index)}
                    aria-current={index === active.currentIndex ? 'step' : undefined}
                    disabled={!canChangeExercise}
                  >
                    <span className="session-step">{done === item.sets.length ? <Check size={16} aria-label={t("ui.completed")} /> : index + 1}</span>
                    <span>{name}</span>
                    <small>{done}/{item.sets.length}</small>
                  </button>
                </li>
              );
            })}
          </ol>
        </details>

        </aside>
      </div>
    </div>
  );
}
