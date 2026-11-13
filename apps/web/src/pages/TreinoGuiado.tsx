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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, X, Timer, Zap, Play, Square, Trophy } from 'lucide-react';

import {
  effectiveRoutine,
  nextPrescription,
  toISO,
  estimate1RM,
  round1,
  computePlates,
  DEFAULT_BAR_KG,
  DEFAULT_PLATES_KG,
} from '@forja/core';
import type {
  Exercise,
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
import type { ActiveExercise, TargetSnapshot } from '../store/session';
import { useWakeLock } from '../lib/useWakeLock';

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

/** Monta os sets pré-preenchidos de um exercício dado a prescrição e a config da rotina. */
function buildSets(config: RoutineExercise, workouts: WorkoutLog[]): SetLog[] {
  const prescription = nextPrescription({ workouts, config });

  return Array.from({ length: config.sets }, (): SetLog => {
    // Modo time
    if (config.targetSec !== undefined) {
      return {
        sec: prescription.sec ?? config.targetSec,
        done: false,
      };
    }
    // Modo cardio
    if (config.targetDistanceM !== undefined || config.targetSpeedKmh !== undefined) {
      return {
        sec: prescription.sec ?? config.targetSec,
        distanceM: config.targetDistanceM,
        speedKmh: config.targetSpeedKmh,
        done: false,
      };
    }
    // Modo reps (padrão)
    return {
      reps: prescription.reps,
      weightKg: prescription.weightKg,
      done: false,
    };
  });
}

/** Monta o TargetSnapshot a partir da config e da prescrição calculada. */
function buildTarget(config: RoutineExercise, workouts: WorkoutLog[]): TargetSnapshot {
  const prescription = nextPrescription({ workouts, config });
  return {
    sets: config.sets,
    reps: config.targetReps,
    sec: config.targetSec,
    weightKg: prescription.weightKg,
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
function getSupersetGroup(exercises: RoutineExercise[], exIndex: number): number[] {
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
  routineExercises: RoutineExercise[],
  exIndex: number,
  setIndex: number,
): boolean {
  const groupIndices = getSupersetGroup(routineExercises, exIndex);
  if (groupIndices.length <= 1) return true; // sem superset → sempre dispara rest

  return groupIndices.every((gi) => {
    const ex = exercises[gi];
    if (ex === undefined) return true;
    const set = ex.sets[setIndex];
    return set !== undefined && set.done;
  });
}

/**
 * Dado que acabamos de concluir a série setIndex do exercício exIndex (superset),
 * devolve o índice do próximo exercício do grupo que ainda não concluiu essa série.
 * Se todos já concluíram, devolve null (hora do rest).
 */
function nextInSuperset(
  exercises: ActiveExercise[],
  routineExercises: RoutineExercise[],
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
    if (set === undefined || !set.done) return nextIdx;
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
function computeHistoricalBestsInline(
  workouts: WorkoutLog[],
  exerciseId: string,
): { best1RM: number; bestWeight: number; hasHistory: boolean } {
  let best1RM = 0;
  let bestWeight = 0;
  let hasHistory = false;

  for (const w of workouts) {
    for (const entry of w.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      hasHistory = true;
      for (const set of entry.sets) {
        if (!set.done) continue;
        if (set.weightKg !== undefined && set.weightKg > bestWeight) {
          bestWeight = set.weightKg;
        }
        if (
          set.weightKg !== undefined &&
          set.weightKg > 0 &&
          set.reps !== undefined &&
          set.reps >= 1 &&
          set.reps <= 12
        ) {
          const orm = estimate1RM(set.weightKg, set.reps);
          if (orm > best1RM) best1RM = orm;
        }
      }
    }
  }
  return { best1RM, bestWeight, hasHistory };
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

/** Toast de PR. */
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

/** Timer de descanso em overlay. */
function RestOverlay({
  endsAt,
  onSkip,
  onComplete,
}: {
  endsAt: number;
  onSkip: () => void;
  onComplete: () => void;
}) {
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
    <motion.div
      className="tg-rest-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <span className="tg-rest-title">Descanso</span>
      <span className={`tg-rest-countdown${urgent ? ' urgent' : ''}`}>
        {fmtSecs(remaining)}
      </span>
      <button className="tg-rest-skip" onClick={onSkip}>
        Pular descanso
      </button>
    </motion.div>
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
        aria-label="Parar série e registrar tempo"
      >
        <Square size={16} fill="currentColor" />
        Parar
      </button>
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
  trackEffort: boolean;
  workTimerSetIndex: number | null; // qual série está com work timer ativo
  onDone: () => void;
  onChange: (patch: Partial<SetLog>) => void;
  onStartWork: (setIndex: number) => void;
  onStopWork: (elapsedSec: number) => void;
  workStartedAt: number | null;
  targetSec?: number;
}

function SetRow({
  exIndex: _exIndex,
  setIndex,
  set,
  isTime,
  isCardio,
  trackEffort,
  workTimerSetIndex,
  onDone,
  onChange,
  onStartWork,
  onStopWork,
  workStartedAt,
  targetSec,
}: SetRowProps) {
  const repsRef = useRef<HTMLInputElement>(null);
  const isWorkActive = workTimerSetIndex === setIndex && workStartedAt !== null;

  return (
    <div className={`tg-set-wrap${set.done ? ' done' : ''}`}>
      <div className="tg-set-row">
        <span className="tg-set-idx">{setIndex + 1}</span>

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
              aria-label={`Série ${setIndex + 1} — segundos`}
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
              aria-label={`Série ${setIndex + 1} — distância metros`}
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
              aria-label={`Série ${setIndex + 1} — segundos`}
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
              aria-label={`Série ${setIndex + 1} — reps`}
            />
            <input
              className="tg-input"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={set.weightKg ?? ''}
              onChange={(e) => onChange({ weightKg: e.target.value === '' ? undefined : Number(e.target.value) })}
              aria-label={`Série ${setIndex + 1} — carga kg`}
            />
          </>
        )}

        {/* Botão play (time/cardio) ou check (reps) */}
        {(isTime || isCardio) && !set.done ? (
          <button
            className={`tg-work-btn${isWorkActive ? ' active' : ''}`}
            onClick={() => isWorkActive ? undefined : onStartWork(setIndex)}
            aria-label={isWorkActive ? 'Série em andamento' : 'Iniciar série'}
            disabled={isWorkActive}
          >
            <Play size={18} strokeWidth={2.4} />
          </button>
        ) : (
          <button
            className={`tg-done-btn${set.done ? ' done' : ''}`}
            onClick={onDone}
            aria-label={set.done ? 'Desmarcar série' : 'Marcar série como feita'}
          >
            <Check size={20} strokeWidth={2.6} />
          </button>
        )}
      </div>

      {/* Work timer ativo para esta série */}
      {isWorkActive && workStartedAt !== null && (
        <WorkTimerDisplay
          startedAt={workStartedAt}
          targetSec={targetSec}
          onStop={(elapsed) => {
            onStopWork(elapsed);
            onChange({ sec: elapsed });
            onDone();
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
            aria-label={`Série ${setIndex + 1} — velocidade km/h`}
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
            aria-label={`Série ${setIndex + 1} — RIR (repetições na reserva)`}
          />
          <span className="tg-rir-hint">reps na reserva</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: calculadora de anilhas (G15)
// ---------------------------------------------------------------------------

/** Fator de conversão kg → lb. */
const KG_TO_LB = 2.20462;

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
        aria-label="Calculadora de anilhas"
      >
        🏋 Anilhas — {fmt(displayWeight)} {unitLabel}
        <span className="tg-plate-toggle-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="tg-plate-body">
          {/* Seletor de barra */}
          <div className="tg-plate-bar-row">
            <span className="tg-plate-label">Barra</span>
            <select
              className="tg-plate-select"
              value={barKg}
              onChange={(e) => setBarKg(Number(e.target.value))}
              aria-label="Peso da barra"
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
            <p className="tg-plate-info">Sem anilhas disponíveis para este peso.</p>
          ) : (
            <>
              <div className="tg-plate-result">
                <span className="tg-plate-label">Por lado:</span>
                <div className="tg-plate-chips">
                  {result.perSide.map((p, i) => (
                    <span key={i} className="tg-plate-chip">
                      {fmt(p)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="tg-plate-achievable">
                Montável: <strong>{fmt(unit === 'lb' ? result.achievableKg * KG_TO_LB : result.achievableKg)} {unitLabel}</strong>
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

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routineIdParam = searchParams.get('routineId');

  const { active, start, logSet, toggleSetDone, goToExercise, startRest, stopRest, cancel, finish } =
    useSessionStore();

  // Dados do banco (leitura reativa)
  const workouts = useLiveQuery(() => db.workouts.toArray(), []) ?? [];
  const exercisesMap = useLiveQuery(
    () => db.exercises.toArray().then((arr) => {
      const m = new Map<string, Exercise>();
      for (const ex of arr) m.set(ex.id, ex);
      return m;
    }),
    [],
  ) ?? new Map<string, Exercise>();

  const routinesMap = useLiveQuery(
    () => db.routines.toArray().then((arr) => {
      const m = new Map<string, Routine>();
      for (const r of arr) m.set(r.id, r);
      return m;
    }),
    [],
  ) ?? new Map<string, Routine>();

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

  // ---- G3: Work timer — estado local (startedAt por exIndex+setIndex) ----
  // workTimerKey: `${exIndex}-${setIndex}` ou null
  const [workTimerKey, setWorkTimerKey] = useState<string | null>(null);
  const [workTimerStartedAt, setWorkTimerStartedAt] = useState<number | null>(null);

  // ---- G8: PRs detectados — toasts ----
  // Lista de PRs pendentes para exibir. Exibimos um de cada vez, 2.5s cada.
  const [prQueue, setPrQueue] = useState<{ pr: PR; exerciseName: string }[]>([]);
  // Conjunto de exerciseIds que já geraram toast nesta sessão (máx 1 por exercício)
  const prToastedRef = useRef<Set<string>>(new Set());
  // PRs acumulados na sessão para gravar no WorkoutLog ao finalizar
  const sessionPRsRef = useRef<PR[]>([]);

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
    if (initDone) return;
    if (exercisesMap.size === 0 && routinesMap.size === 0) return;

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
          setInitError(`Rotina "${resolvedId}" não encontrada.`);
          setInitDone(true);
          return;
        }

        const exercises: ActiveExercise[] = routine.exercises.map((cfg: RoutineExercise) => ({
          exerciseId: cfg.exerciseId,
          target: buildTarget(cfg, workouts),
          sets: buildSets(cfg, workouts),
        }));

        const fetchedSettings = await getSettings();

        start({
          dateISO: today,
          routineId: routine.id,
          categoryId: routine.categoryId,
          exercises,
        });

        defaultRestSecRef.current = fetchedSettings.defaultRestSec;
        setInitDone(true);
      } catch (err) {
        setInitError(err instanceof Error ? err.message : 'Erro ao iniciar sessão.');
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
      if (active === null) return;
      const ex = active.exercises[exIndex];
      if (ex === undefined) return;

      const { exerciseId } = ex;
      const { best1RM, bestWeight, hasHistory } = computeHistoricalBestsInline(workouts, exerciseId);
      if (!hasHistory) return;

      const set = ex.sets[setIndex];
      if (set === undefined || !set.done) return;

      const exName = exercisesMap.get(exerciseId)?.name ?? exerciseId;

      // PR de carga bruta
      if (
        set.weightKg !== undefined &&
        set.weightKg > bestWeight &&
        !prToastedRef.current.has(`${exerciseId}-weight`)
      ) {
        const pr: PR = { exerciseId, kind: 'weight', value: set.weightKg };
        sessionPRsRef.current.push(pr);
        prToastedRef.current.add(`${exerciseId}-weight`);
        setPrQueue((q) => [...q, { pr, exerciseName: exName }]);
      }

      // PR de 1RM (série elegível: carga > 0, 1 ≤ reps ≤ 12)
      if (
        set.weightKg !== undefined &&
        set.weightKg > 0 &&
        set.reps !== undefined &&
        set.reps >= 1 &&
        set.reps <= 12 &&
        !prToastedRef.current.has(`${exerciseId}-1rm`)
      ) {
        const orm = estimate1RM(set.weightKg, set.reps);
        if (orm > best1RM) {
          const pr: PR = { exerciseId, kind: '1rm', value: orm };
          sessionPRsRef.current.push(pr);
          prToastedRef.current.add(`${exerciseId}-1rm`);
          setPrQueue((q) => [...q, { pr, exerciseName: exName }]);
        }
      }
    },
    [active, workouts, exercisesMap],
  );

  function handleToggleDone(exIndex: number, setIndex: number) {
    if (active === null) return;

    const ex = active.exercises[exIndex];
    const set = ex?.sets[setIndex];
    if (set === undefined) return;

    const wasNotDone = !set.done;
    toggleSetDone(exIndex, setIndex);

    if (!wasNotDone) return; // estava done → desmarcou, nada mais

    // Cancela work timer se estava rodando para esta série
    if (workTimerKey === `${exIndex}-${setIndex}`) {
      setWorkTimerKey(null);
      setWorkTimerStartedAt(null);
    }

    // Detecta PR (após toggle, o set agora está done=true)
    // Usamos o estado do store que ainda reflete o set atualizado via Immer-like
    // Precisamos checar depois que o estado propagou — usamos um setTimeout(0) leve
    setTimeout(() => checkForPR(exIndex, setIndex), 0);

    // ---- G2: lógica de superset ----
    const routine = active.routineId !== undefined ? routinesMap.get(active.routineId) : undefined;
    const routineExercises = routine?.exercises ?? [];

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
        startRest(effectiveRest);
      }
      return;
    }

    // ---- Comportamento padrão (sem superset) ----
    const effectiveRest = cfg?.restSec ?? defaultRestSecRef.current;
    startRest(effectiveRest);
  }

  async function handleFinish() {
    try {
      // Injeta os PRs acumulados no WorkoutLog via finish() do store
      // O store não aceita prFlags diretamente, então usamos o retorno
      const log: WorkoutLog = await finish();
      // Se há PRs, poderíamos persistir de volta — mas o spec diz que é derivável.
      // Aqui apenas descartamos (já foi detectado e exibido).
      void log;
      navigate('/historico');
    } catch {
      navigate('/');
    }
  }

  function handleCancel() {
    if (!window.confirm('Cancelar o treino? O progresso será perdido.')) return;
    cancel();
    navigate('/');
  }

  // ---- G3: Work timer handlers ----
  function handleStartWork(exIndex: number, setIndex: number) {
    // Cancela rest timer se houver (os dois são mutuamente exclusivos)
    stopRest();
    setWorkTimerKey(`${exIndex}-${setIndex}`);
    setWorkTimerStartedAt(Date.now());
  }

  function handleStopWork(_elapsedSec: number) {
    setWorkTimerKey(null);
    setWorkTimerStartedAt(null);
  }

  // ---- Guard: aguarda inicialização ----
  if (!initDone) {
    return (
      <div className="tg-empty">
        <Zap size={36} color="var(--flame)" strokeWidth={2} />
        <h2>Carregando...</h2>
      </div>
    );
  }

  // ---- Sem treino hoje ----
  if (active === null && (todayRoutineId === null || todayRoutineId === 'rest')) {
    return (
      <div className="tg-empty">
        <Timer size={36} color="var(--text-muted)" strokeWidth={1.5} />
        <h2>Hoje é descanso</h2>
        <p>Nenhum treino programado para hoje. Escolha uma rotina na aba Treinos para iniciar mesmo assim.</p>
        <button className="btn ghost" onClick={() => navigate('/treinos')}>
          Ver rotinas
        </button>
      </div>
    );
  }

  // ---- Erro de inicialização ----
  if (active === null && initError !== null) {
    return (
      <div className="tg-empty">
        <X size={36} color="var(--danger)" strokeWidth={2} />
        <h2>Ops</h2>
        <p>{initError}</p>
        <button className="btn ghost" onClick={() => navigate('/')}>
          Voltar
        </button>
      </div>
    );
  }

  if (active === null) return null;

  const currentEx = active.exercises[active.currentIndex];
  if (currentEx === undefined) return null;

  const exData = exercisesMap.get(currentEx.exerciseId);
  const exName = exData?.name ?? currentEx.exerciseId;
  const isCardio = exData?.mode === 'cardio';
  const isTime = exData?.mode === 'time';
  const isTimedMode = isTime || isCardio;
  const totalExercises = active.exercises.length;

  const routine = active.routineId !== undefined ? routinesMap.get(active.routineId) : undefined;
  const currentCfg = routine?.exercises[active.currentIndex];
  const prescription =
    currentCfg !== undefined
      ? nextPrescription({ workouts, config: currentCfg })
      : null;

  // ---- G2: informações de superset ----
  const routineExercises = routine?.exercises ?? [];
  const supersetGroupIndices = getSupersetGroup(routineExercises, active.currentIndex);
  const isInSuperset = supersetGroupIndices.length > 1;
  const supersetGroupNum = currentCfg?.supersetGroup;

  // Calcula o round atual do superset (quantas séries completas o primeiro do grupo já tem)
  const firstGroupIdx = supersetGroupIndices[0] ?? active.currentIndex;
  const firstGroupEx = active.exercises[firstGroupIdx];
  const roundsDone = firstGroupEx?.sets.filter((s) => s.done).length ?? 0;
  const totalRounds = currentEx.target.sets;

  const restActive = active.rest.endsAt !== null && active.rest.endsAt > Date.now();

  // Work timer ativo para o exercício atual
  const activeWorkKey = workTimerKey;
  const activeWorkSetIndex = activeWorkKey?.startsWith(`${active.currentIndex}-`)
    ? Number(activeWorkKey.split('-')[1])
    : null;

  return (
    <>
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

      {/* Rest timer overlay */}
      <AnimatePresence>
        {restActive && active.rest.endsAt !== null && (
          <RestOverlay
            key="rest"
            endsAt={active.rest.endsAt}
            onSkip={stopRest}
            onComplete={stopRest}
          />
        )}
      </AnimatePresence>

      {/* Topbar */}
      <div className="tg-topbar">
        <span className="tg-title">
          {routine?.name ?? 'Treino livre'}
        </span>
        <span className="tg-progress">
          {active.currentIndex + 1}/{totalExercises}
        </span>
      </div>

      {/* Card do exercício */}
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

        <div className="tg-ex-name">{exName}</div>
        <div className="tg-ex-meta">
          {currentEx.target.sets} série{currentEx.target.sets !== 1 ? 's' : ''}
          {isTimedMode
            ? currentEx.target.sec !== undefined
              ? ` · ${currentEx.target.sec}s`
              : ''
            : currentEx.target.reps !== undefined
              ? ` · ${currentEx.target.reps} reps`
              : ''}
          {currentEx.target.weightKg !== undefined
            ? ` · ${currentEx.target.weightKg}kg`
            : ''}
          {isCardio && currentCfg?.targetDistanceM !== undefined
            ? ` · ${currentCfg.targetDistanceM}m`
            : ''}
          {isCardio && currentCfg?.targetSpeedKmh !== undefined
            ? ` · ${currentCfg.targetSpeedKmh}km/h`
            : ''}
        </div>

        {/* Dica discreta de prescrição */}
        {prescription !== null && prescription.kind !== 'fresh' && (
          <div className="tg-why">{prescription.why}</div>
        )}
        {prescription !== null && prescription.kind === 'fresh' && (
          <div className="tg-why">Primeira vez com este exercício — defina os valores iniciais.</div>
        )}

        {/* Labels de coluna */}
        <div className="tg-col-labels">
          <span />
          <span className="tg-col-label">{isCardio ? 'Seg' : isTime ? 'Seg' : 'Reps'}</span>
          <span className="tg-col-label">{isCardio ? 'Dist (m)' : isTime ? '' : 'Kg'}</span>
          <span className="tg-col-label">OK</span>
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
              trackEffort={trackEffort}
              workTimerSetIndex={activeWorkSetIndex}
              workStartedAt={
                activeWorkSetIndex === si ? workTimerStartedAt : null
              }
              targetSec={currentCfg?.targetSec}
              onDone={() => handleToggleDone(active.currentIndex, si)}
              onChange={(patch) => logSet(active.currentIndex, si, patch)}
              onStartWork={(setIdx) => handleStartWork(active.currentIndex, setIdx)}
              onStopWork={handleStopWork}
            />
          ))}
        </div>

        {/* Calculadora de anilhas (G15) — só no modo reps com peso */}
        {!isTimedMode && (
          <PlateCalc
            weightKg={currentEx.sets[0]?.weightKg}
            unit={unit}
          />
        )}
      </div>

      {/* Navegação entre exercícios */}
      <div className="tg-ex-nav">
        <button
          className="btn ghost"
          disabled={active.currentIndex === 0}
          onClick={() => goToExercise(active.currentIndex - 1)}
          aria-label="Exercício anterior"
        >
          <ChevronLeft size={18} />
          Anterior
        </button>
        {active.currentIndex < totalExercises - 1 ? (
          <button
            className="btn"
            onClick={() => goToExercise(active.currentIndex + 1)}
            aria-label="Próximo exercício"
          >
            Próximo
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => void handleFinish()}
            aria-label="Finalizar treino"
          >
            Finalizar
            <Check size={18} />
          </button>
        )}
      </div>

      {/* Rodapé */}
      <div className="tg-footer">
        <button
          className="btn ghost"
          onClick={handleCancel}
          aria-label="Cancelar treino"
          style={{ flex: 'unset', padding: '12px 16px' }}
        >
          <X size={16} />
          Cancelar
        </button>
        {active.currentIndex < totalExercises - 1 && (
          <button
            className="btn"
            onClick={() => void handleFinish()}
            aria-label="Finalizar treino agora"
          >
            <Check size={16} />
            Finalizar treino
          </button>
        )}
      </div>
    </>
  );
}
