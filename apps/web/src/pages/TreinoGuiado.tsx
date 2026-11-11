// Página de treino guiado — sessão ativa.
// Rota: /treino  (wiring feito em App.tsx pelo caller)
// Fluxo: determina rotina → monta sessão → usuário marca séries → rest timer → grava.

import '../styles/treino.css';

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, X, Timer, Zap } from 'lucide-react';

import {
  effectiveRoutine,
  nextPrescription,
  toISO,
} from '@forja/core';
import type {
  Exercise,
  Routine,
  RoutineExercise,
  SetLog,
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
// Sub-componentes
// ---------------------------------------------------------------------------

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
  // Ref para evitar chamar onComplete mais de uma vez
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    const id = setInterval(() => {
      const r = (endsAt - Date.now()) / 1000;
      if (r <= 0) {
        setRemaining(0);
        clearInterval(id);
        // Vibra ao encerrar
        try { navigator.vibrate?.(200); } catch { /* sem suporte */ }
        // Bip curto via WebAudio
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
        // Fecha o overlay automaticamente
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      } else {
        setRemaining(r);
      }
    }, 500);
    return () => clearInterval(id);
    // onComplete é estável (vem do pai como função nomeada); endsAt muda por design
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

// ---------------------------------------------------------------------------
// Componente de série
// ---------------------------------------------------------------------------

interface SetRowProps {
  exIndex: number;
  setIndex: number;
  set: SetLog;
  isTime: boolean;
  trackEffort: boolean;
  onDone: () => void;
  onChange: (patch: Partial<SetLog>) => void;
}

function SetRow({ exIndex: _exIndex, setIndex, set, isTime, trackEffort, onDone, onChange }: SetRowProps) {
  const repsRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`tg-set-wrap${set.done ? ' done' : ''}`}>
      <div className="tg-set-row">
        <span className="tg-set-idx">{setIndex + 1}</span>

        {isTime ? (
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
        ) : (
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
        )}

        {!isTime && (
          <input
            ref={weightRef}
            className="tg-input"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={set.weightKg ?? ''}
            onChange={(e) => onChange({ weightKg: e.target.value === '' ? undefined : Number(e.target.value) })}
            aria-label={`Série ${setIndex + 1} — carga kg`}
          />
        )}

        {/* ocupa coluna de peso no modo time para manter o grid alinhado */}
        {isTime && <span />}

        <button
          className={`tg-done-btn${set.done ? ' done' : ''}`}
          onClick={onDone}
          aria-label={set.done ? 'Desmarcar série' : 'Marcar série como feita'}
        >
          <Check size={20} strokeWidth={2.6} />
        </button>
      </div>

      {/* Campo RIR — só aparece quando trackEffort está ativo */}
      {trackEffort && (
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

  // Settings reativas (trackEffort + defaultRestSec via useLiveQuery)
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const trackEffort = settings?.trackEffort ?? false;

  // Ref para o defaultRestSec — preenchido no init e mantido sincronizado pelo liveQuery
  const defaultRestSecRef = useRef<number>(90);

  // Mantém o ref sincronizado com as settings reativas (sem depender de um useEffect separado)
  if (settings !== undefined) {
    defaultRestSecRef.current = settings.defaultRestSec;
  }

  // Estado de inicialização da sessão
  const [initDone, setInitDone] = useState(false);
  const [todayRoutineId, setTodayRoutineId] = useState<string | 'rest' | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Determina a rotina e inicia a sessão (uma vez, quando os dados do db chegarem)
  useEffect(() => {
    if (initDone) return;
    // Aguarda a carga dos maps
    if (exercisesMap.size === 0 && routinesMap.size === 0) return;

    void (async () => {
      try {
        // Se já há sessão ativa, retoma
        if (active !== null) {
          setInitDone(true);
          return;
        }

        const today = toISO(new Date());

        // Determina o routineId a usar
        let resolvedId: string | 'rest' | null = null;

        if (routineIdParam !== null) {
          // Rotina explícita via query param
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

        // Inicializa o ref com o valor do banco (o liveQuery pode ainda estar carregando)
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

  function handleToggleDone(exIndex: number, setIndex: number) {
    if (active === null) return;
    toggleSetDone(exIndex, setIndex);

    const ex = active.exercises[exIndex];
    const set = ex?.sets[setIndex];
    if (set === undefined) return;

    // Se acabou de marcar como feito (não era done), inicia o descanso
    const wasNotDone = !set.done;
    if (wasNotDone) {
      // Busca o restSec configurado na rotina para este exercício, ou usa o default das settings
      const routine = active.routineId !== undefined ? routinesMap.get(active.routineId) : undefined;
      const cfg = routine?.exercises[exIndex];
      const effectiveRest = cfg?.restSec ?? defaultRestSecRef.current;

      startRest(effectiveRest);
    }
  }

  async function handleFinish() {
    try {
      const log: WorkoutLog = await finish();
      void log; // resultado disponível se quisermos mostrar resumo depois
      navigate('/historico');
    } catch {
      // Fallback: navega mesmo assim
      navigate('/');
    }
  }

  function handleCancel() {
    if (!window.confirm('Cancelar o treino? O progresso será perdido.')) return;
    cancel();
    navigate('/');
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

  // ---- Sessão ativa: nunca deveria ser null aqui, mas TypeScript precisa do guard ----
  if (active === null) return null;

  const currentEx = active.exercises[active.currentIndex];
  if (currentEx === undefined) return null;

  const exData = exercisesMap.get(currentEx.exerciseId);
  const exName = exData?.name ?? currentEx.exerciseId;
  const isTime = exData?.mode === 'time' || exData?.mode === 'cardio';
  const totalExercises = active.exercises.length;

  // Dica de prescrição: busca o `why` da prescrição atual
  const routine = active.routineId !== undefined ? routinesMap.get(active.routineId) : undefined;
  const currentCfg = routine?.exercises[active.currentIndex];
  const prescription =
    currentCfg !== undefined
      ? nextPrescription({ workouts, config: currentCfg })
      : null;

  const restActive = active.rest.endsAt !== null && active.rest.endsAt > Date.now();

  return (
    <>
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
        <div className="tg-ex-name">{exName}</div>
        <div className="tg-ex-meta">
          {currentEx.target.sets} série{currentEx.target.sets !== 1 ? 's' : ''}
          {isTime
            ? currentEx.target.sec !== undefined
              ? ` · ${currentEx.target.sec}s`
              : ''
            : currentEx.target.reps !== undefined
              ? ` · ${currentEx.target.reps} reps`
              : ''}
          {currentEx.target.weightKg !== undefined
            ? ` · ${currentEx.target.weightKg}kg`
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
          <span className="tg-col-label">{isTime ? 'Seg' : 'Reps'}</span>
          {!isTime && <span className="tg-col-label">Kg</span>}
          {isTime && <span />}
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
              trackEffort={trackEffort}
              onDone={() => handleToggleDone(active.currentIndex, si)}
              onChange={(patch) => logSet(active.currentIndex, si, patch)}
            />
          ))}
        </div>
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
        {/* Botão finalizar antecipado (sempre disponível) */}
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
