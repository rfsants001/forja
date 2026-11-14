import '../styles/setup.css';
import { useEffect, useRef, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  Save,
  Link2,
  Unlink2,
} from 'lucide-react';
import type { RoutineExercise, ProgressionPolicy, ExerciseMode, MuscleGroup, Exercise, WorkoutLog } from '@forja/core';
import { estimate1RM } from '@forja/core';
import { db } from '../db/db';
import { upsertRoutine, deleteRoutine } from '../db/repo';
import {
  MUSCLE_LABEL,
  MODE_LABEL,
  PROGRESSION_LABEL,
  PROGRESSION_OPTIONS,
  MUSCLE_OPTIONS,
} from '../lib/labels';
import { Media } from '../components/Media';
import { MuscleMap } from '../components/MuscleMap';
import { previewVolumeByMuscle } from '../lib/stats';

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

interface RexDraft extends RoutineExercise {
  /** key estável para a lista (exerciseId pode repetir em supersets) */
  _key: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newKey() {
  return Math.random().toString(36).slice(2, 9);
}

/** Converte número de superset para letra A, B, C... */
function supersetLabel(group: number): string {
  return String.fromCharCode(64 + (((group - 1) % 26) + 1));
}

/** Calcula o próximo número de grupo disponível na lista. */
function nextSupersetGroup(list: RexDraft[]): number {
  let max = 0;
  for (const r of list) {
    if (r.supersetGroup !== undefined && r.supersetGroup > max) {
      max = r.supersetGroup;
    }
  }
  return max + 1;
}

// Paleta de cores para grupos A, B, C... (loop se >8)
const SUPERSET_COLORS = [
  'var(--flame)',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

function supersetColor(group: number): string {
  return SUPERSET_COLORS[(group - 1) % SUPERSET_COLORS.length] ?? 'var(--flame)';
}

// ---------------------------------------------------------------------------
// Sub-componente: Seletor de exercícios (modal)
// Performance: exibe 50 itens + "carregar mais" para suportar 1324+ exercícios.
// A busca/filtro opera sobre o conjunto completo; a paginação só afeta a exibição.
// ---------------------------------------------------------------------------

const PICKER_PAGE_SIZE = 50;

interface ExPickerProps {
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}

function ExPicker({ onSelect, onClose }: ExPickerProps) {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);
  const [visibleCount, setVisibleCount] = useState(PICKER_PAGE_SIZE);

  // Filtragem sobre o conjunto completo
  const filtered = useMemo(() => {
    const all = exercises ?? [];
    const q = query.toLowerCase().trim();
    return all.filter((ex) => {
      if (q.length > 0 && !ex.name.toLowerCase().includes(q)) return false;
      if (muscleFilter !== null && ex.primaryMuscle !== muscleFilter) return false;
      return true;
    });
  }, [exercises, query, muscleFilter]);

  useEffect(() => {
    setVisibleCount(PICKER_PAGE_SIZE);
  }, [query, muscleFilter]);

  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    }
  }, []);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <dialog ref={dialogRef} className="sheet form-dialog ex-picker-dialog"
      aria-labelledby="exercise-picker-title" onClose={onClose}>
      <div className="ex-picker-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 id="exercise-picker-title">Adicionar exercício</h3>
          <button className="icon-btn" type="button" onClick={() => dialogRef.current?.close()} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Busca */}
        <div className="search-bar">
          <Search size={15} color="var(--text-muted)" />
          <input
            type="search" aria-label="Buscar exercício para a rotina"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.length > 0 && (
            <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')} style={{ color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filtro por músculo */}
        <div className="chip-row">
          <button
            className={`chip${muscleFilter === null ? ' active' : ''}`}
            onClick={() => setMuscleFilter(null)}
          >
            Todos
          </button>
          {MUSCLE_OPTIONS.map((m) => (
            <button
              key={m}
              className={`chip${muscleFilter === m ? ' active' : ''}`}
              onClick={() => setMuscleFilter(muscleFilter === m ? null : m)}
            >
              {MUSCLE_LABEL[m]}
            </button>
          ))}
        </div>

        {/* Contador */}
        {filtered.length > 0 && (
          <p className="hint" style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {filtered.length} exercício{filtered.length !== 1 ? 's' : ''}
            {filtered.length > visibleCount ? ` — mostrando ${visibleCount}` : ''}
          </p>
        )}

        {/* Lista */}
        <div className="ex-picker-list">
          {visible.map((ex) => (
            <div
              key={ex.id}
              className="ex-item selectable"
              onClick={() => { onSelect(ex.id); onClose(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') { onSelect(ex.id); onClose(); } }}
            >
              {/* G1: miniatura da demo */}
              <Media exerciseId={ex.id} demo={ex.demo} name={ex.name} size="sm" staticOnly />
              <div className="ex-info">
                <div className="ex-name">{ex.name}</div>
                <div className="ex-meta">
                  {MUSCLE_LABEL[ex.primaryMuscle]} · {MODE_LABEL[ex.mode]}
                </div>
              </div>
              <Plus size={16} color="var(--flame)" />
            </div>
          ))}

          {/* Carregar mais */}
          {hasMore && (
            <button
              className="btn ghost"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              onClick={() => setVisibleCount((n) => n + PICKER_PAGE_SIZE)}
            >
              Carregar mais ({filtered.length - visibleCount} restantes)
            </button>
          )}

          {filtered.length === 0 && (
            <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              Nenhum exercício encontrado.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: linha de configuração de um RoutineExercise
// ---------------------------------------------------------------------------

interface RexRowProps {
  rex: RexDraft;
  mode: ExerciseMode;
  exName: string;
  demo: Exercise['demo'];
  index: number;
  total: number;
  selected: boolean;
  onToggleSelect: (key: string) => void;
  onChange: (key: string, patch: Partial<RoutineExercise>) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
  onRemove: (key: string) => void;
  onUngroup: (key: string) => void;
  /** Calcula o TM a partir do melhor set histórico (90% do 1RM estimado). */
  onDeriveTM: (key: string) => void;
}

function RexRow({
  rex, mode, exName, demo, index, total,
  selected, onToggleSelect,
  onChange, onMoveUp, onMoveDown, onRemove, onUngroup, onDeriveTM,
}: RexRowProps) {
  const hasGroup = rex.supersetGroup !== undefined;
  const color = hasGroup ? supersetColor(rex.supersetGroup!) : undefined;
  const label = hasGroup ? supersetLabel(rex.supersetGroup!) : undefined;

  return (
    <div
      className={`rex-item${selected ? ' rex-item--selected' : ''}${hasGroup ? ' rex-item--superset' : ''}`}
      style={hasGroup ? { '--superset-color': color } as React.CSSProperties : undefined}
    >
      {/* Indicador lateral de superset */}
      {hasGroup && (
        <div className="rex-superset-bar" aria-hidden="true" />
      )}

      <div className="rex-item-header">
        {/* G1: miniatura demo */}
        <Media exerciseId={rex.exerciseId} demo={demo} name={exName} size="sm" staticOnly />

        {/* Checkbox de seleção para agrupar */}
        <button type="button"
          className={`rex-select-btn${selected ? ' active' : ''}`}
          onClick={() => onToggleSelect(rex._key)}
          aria-label={selected ? 'Desselecionar' : 'Selecionar para superset'}
          title={selected ? 'Desselecionar' : 'Selecionar para superset'}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rex-name">{exName}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
            <span className="rex-mode">{MODE_LABEL[mode]}</span>
            {hasGroup && (
              <span
                className="rex-superset-badge"
                style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, borderColor: color, color }}
              >
                Superset {label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rex-controls">
        {/* Sets — sempre */}
        <div className="field">
          <label htmlFor={`rex-sets-${rex._key}`}>Séries</label>
          <input id={`rex-sets-${rex._key}`}
            type="number" inputMode="numeric"
            min={1}
            max={20}
            value={rex.sets || ''}
            onChange={(event) => onChange(rex._key, { sets: event.target.valueAsNumber || 0 })}
            required
          />
        </div>

        {/* G3: campos condicionais por modo */}
        {mode === 'reps' && (
          <div className="field">
            <label htmlFor={`rex-reps-${rex._key}`}>Repetições-alvo</label>
            <input id={`rex-reps-${rex._key}`}
              type="text"
              placeholder="Ex.: 8–12"
              value={rex.targetReps ?? ''}
              onChange={(e) => onChange(rex._key, { targetReps: e.target.value || undefined })}
            />
          </div>
        )}

        {mode === 'time' && (
          <div className="field">
            <label htmlFor={`rex-seconds-${rex._key}`}>Tempo (s)</label>
            <input id={`rex-seconds-${rex._key}`}
              type="number" inputMode="decimal"
              min={1}
              placeholder="Ex.: 60"
              value={rex.targetSec ?? ''}
              onChange={(e) =>
                onChange(rex._key, {
                  targetSec: e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                })
              }
            />
          </div>
        )}

        {mode === 'cardio' && (
          <>
            <div className="field">
              <label htmlFor={`rex-seconds-${rex._key}`}>Tempo (s)</label>
              <input id={`rex-seconds-${rex._key}`}
                type="number" inputMode="decimal"
                min={1}
                placeholder="Opcional"
                value={rex.targetSec ?? ''}
                onChange={(e) =>
                  onChange(rex._key, {
                    targetSec: e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`rex-distance-${rex._key}`}>Distância (m)</label>
              <input id={`rex-distance-${rex._key}`}
                type="number" inputMode="decimal"
                min={0}
                step="any"
                placeholder="Ex.: 1000"
                value={rex.targetDistanceM ?? ''}
                onChange={(e) =>
                  onChange(rex._key, {
                    targetDistanceM: e.target.value === '' ? undefined : parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`rex-speed-${rex._key}`}>Velocidade (km/h)</label>
              <input id={`rex-speed-${rex._key}`}
                type="number" inputMode="decimal"
                min={0}
                step="any"
                placeholder="Ex.: 10"
                value={rex.targetSpeedKmh ?? ''}
                onChange={(e) =>
                  onChange(rex._key, {
                    targetSpeedKmh: e.target.value === '' ? undefined : parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </>
        )}

        {/* Descanso — sempre */}
        <div className="field">
          <label htmlFor={`rex-rest-${rex._key}`}>Descanso (s)</label>
          <input id={`rex-rest-${rex._key}`}
            type="number" inputMode="decimal"
            min={0}
            placeholder="Ex.: 90"
            value={rex.restSec ?? ''}
            onChange={(e) =>
              onChange(rex._key, {
                restSec: e.target.value === '' ? undefined : parseInt(e.target.value, 10),
              })
            }
          />
        </div>

        {/* Incremento — só para reps */}
        {mode === 'reps' && (
          <div className="field">
            <label htmlFor={`rex-increment-${rex._key}`}>Incremento (kg)</label>
            <input id={`rex-increment-${rex._key}`}
              type="number" inputMode="decimal"
              min={0}
              step="any"
              placeholder="Ex.: 2.5"
              value={rex.incrementKg ?? ''}
              onChange={(e) =>
                onChange(rex._key, {
                  incrementKg: e.target.value === '' ? undefined : parseFloat(e.target.value),
                })
              }
            />
          </div>
        )}

        {/* Progressão */}
        <div className="field full">
          <label htmlFor={`rex-progression-${rex._key}`}>Progressão</label>
          <select id={`rex-progression-${rex._key}`}
            value={rex.progression ?? 'off'}
            onChange={(e) =>
              onChange(rex._key, { progression: e.target.value as ProgressionPolicy })
            }
          >
            {PROGRESSION_OPTIONS.map((p) => (
              <option key={p} value={p}>{PROGRESSION_LABEL[p]}</option>
            ))}
          </select>
        </div>

        {/* Training max — só para 5/3/1 */}
        {rex.progression === '531' && (
          <>
            <div className="field">
              <label htmlFor={`rex-tm-${rex._key}`}>Máximo de treino (kg)</label>
              <input id={`rex-tm-${rex._key}`}
                type="number" inputMode="decimal"
                min={1}
                step="any"
                placeholder="Ex.: 100"
                value={rex.trainingMaxKg ?? ''}
                onChange={(e) =>
                  onChange(rex._key, {
                    trainingMaxKg: e.target.value === '' ? undefined : parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div className="field">
              <label>
                Aumento por ciclo (kg)
                <input type="number" inputMode="decimal" min={0} step="any" placeholder="2,5" value={rex.trainingMaxIncrementKg ?? ''}
                  onChange={(event) => onChange(rex._key, {
                    trainingMaxIncrementKg: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)),
                  })} />
              </label>
            </div>
            <div className="field">
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                onClick={() => onDeriveTM(rex._key)}
                title="Calcula o TM como 90% do seu melhor 1RM estimado no histórico"
              >
                Calcular pelo histórico
              </button>
            </div>
          </>
        )}
      </div>

      {/* Ações da linha */}
      <div className="rex-actions">
        {hasGroup && (
          <button type="button"
            className="icon-btn"
            onClick={() => onUngroup(rex._key)}
            aria-label="Remover do superset"
            title="Remover do superset"
          >
            <Unlink2 size={15} />
          </button>
        )}
        <button type="button"
          className="icon-btn"
          disabled={index === 0}
          onClick={() => onMoveUp(rex._key)}
          aria-label="Mover para cima"
        >
          <ChevronUp size={15} />
        </button>
        <button type="button"
          className="icon-btn"
          disabled={index === total - 1}
          onClick={() => onMoveDown(rex._key)}
          aria-label="Mover para baixo"
        >
          <ChevronDown size={15} />
        </button>
        <button type="button"
          className="icon-btn danger"
          onClick={() => onRemove(rex._key)}
          aria-label="Remover exercício"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function RotinaEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'nova' || id === undefined;
  const navigate = useNavigate();

  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const workouts = useLiveQuery<WorkoutLog[]>(() => db.workouts.toArray(), []) ?? [];

  // Map exerciseId → Exercise completo para lookup rápido (G1 + G7)
  const exerciseMap = useMemo(() => {
    const map = new Map<string, Exercise>();
    (exercises ?? []).forEach((ex) => map.set(ex.id, ex));
    return map;
  }, [exercises]);

  // Estado do formulário
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [rexList, setRexList] = useState<RexDraft[]>([]);

  // G2: seleção para agrupar em superset
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Carrega a rotina ao montar (se edição)
  useEffect(() => {
    if (isNew) return;
    void db.routines.get(id ?? '').then((r) => {
      if (r === undefined) {
        navigate('/treinos', { replace: true });
        return;
      }
      setName(r.name);
      setCategoryId(r.categoryId);
      setNote(r.note ?? '');
      setRexList(r.exercises.map((rex) => ({ ...rex, _key: newKey() })));
    });
  }, [id, isNew, navigate]);

  // Primeira categoria disponível como default
  useEffect(() => {
    if (categoryId === '' && (categories ?? []).length > 0) {
      const first = categories?.[0];
      if (first !== undefined) setCategoryId(first.id);
    }
  }, [categories, categoryId]);

  // ---------------------------------------------------------------------------
  // G7: preview muscular (recomputa toda vez que rexList muda)
  // ---------------------------------------------------------------------------
  const volumeByMuscle = useMemo(() => {
    const map = previewVolumeByMuscle(rexList, exerciseMap);
    // Converte Map para Partial<Record<MuscleGroup,number>> esperado pelo MuscleMap
    const record: Partial<Record<MuscleGroup, number>> = {};
    for (const [muscle, v] of map) {
      record[muscle] = v;
    }
    return record;
  }, [rexList, exerciseMap]);

  const hasAnyVolume = Object.keys(volumeByMuscle).length > 0;

  // ---------------------------------------------------------------------------
  // Manipulação da lista de exercícios
  // ---------------------------------------------------------------------------

  function addExercise(exerciseId: string) {
    const draft: RexDraft = {
      _key: newKey(),
      exerciseId,
      sets: 3,
      targetReps: '8–12',
      restSec: 90,
      progression: 'off',
    };
    setRexList((l) => [...l, draft]);
  }

  function patchRex(key: string, patch: Partial<RoutineExercise>) {
    setRexList((l) =>
      l.map((r) => (r._key === key ? { ...r, ...patch } : r)),
    );
  }

  function moveUp(key: string) {
    setRexList((l) => {
      const i = l.findIndex((r) => r._key === key);
      if (i <= 0) return l;
      const next = [...l];
      const a = next[i - 1];
      const b = next[i];
      if (a === undefined || b === undefined) return l;
      next[i - 1] = b;
      next[i] = a;
      return next;
    });
  }

  function moveDown(key: string) {
    setRexList((l) => {
      const i = l.findIndex((r) => r._key === key);
      if (i < 0 || i >= l.length - 1) return l;
      const next = [...l];
      const a = next[i];
      const b = next[i + 1];
      if (a === undefined || b === undefined) return l;
      next[i] = b;
      next[i + 1] = a;
      return next;
    });
  }

  function removeRex(key: string) {
    setRexList((l) => l.filter((r) => r._key !== key));
    setSelectedKeys((s) => { const next = new Set(s); next.delete(key); return next; });
  }

  /**
   * 5/3/1: Deriva o TM a partir do melhor set histórico do exercício.
   * TM ≈ 90% do melhor 1RM estimado (fórmula Epley) em qualquer sessão logada.
   * Arredondado para o múltiplo de 2.5 mais próximo.
   */
  function deriveTM(key: string) {
    const rex = rexList.find((r) => r._key === key);
    if (rex === undefined) return;

    // Varre todos os sets logados para encontrar o melhor 1RM estimado.
    let best1RM = 0;
    for (const wo of workouts) {
      for (const entry of wo.entries) {
        if (entry.exerciseId !== rex.exerciseId) continue;
        for (const s of entry.sets) {
          if (!s.done || s.weightKg === undefined || s.reps === undefined) continue;
          const rm = estimate1RM(s.weightKg, s.reps);
          if (rm > best1RM) best1RM = rm;
        }
      }
    }

    if (best1RM <= 0) {
      alert('Nenhum histórico encontrado para este exercício. Informe o TM manualmente.');
      return;
    }

    // TM = 90% do 1RM, arredondado para 2.5 kg.
    const roundKg = rex.incrementKg ?? 2.5;
    const tm = Math.round((best1RM * 0.9) / roundKg) * roundKg;
    patchRex(key, { trainingMaxKg: tm });
  }

  // G2: toggle seleção para superset
  function toggleSelect(key: string) {
    setSelectedKeys((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // G2: agrupar selecionados em superset
  function groupSelected() {
    if (selectedKeys.size < 2) return;
    const group = nextSupersetGroup(rexList);
    setRexList((l) =>
      l.map((r) => (selectedKeys.has(r._key) ? { ...r, supersetGroup: group } : r)),
    );
    setSelectedKeys(new Set());
  }

  // G2: remover exercício do superset (ungroup individual)
  function ungroupRex(key: string) {
    setRexList((l) => {
      const target = l.find((r) => r._key === key);
      if (target?.supersetGroup === undefined) return l;
      const group = target.supersetGroup;

      // Verifica quantos restam no grupo após remoção
      const remaining = l.filter((r) => r._key !== key && r.supersetGroup === group);

      return l.map((r) => {
        if (r._key === key) {
          const { supersetGroup: _sg, ...rest } = r;
          return { ...rest, _key: r._key };
        }
        // Se só sobrou 1 no grupo, remove o grupo dele também
        if (remaining.length === 1 && r.supersetGroup === group) {
          const { supersetGroup: _sg, ...rest } = r;
          return { ...rest, _key: r._key };
        }
        return r;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Salvar / excluir
  // ---------------------------------------------------------------------------

  async function handleSave() {
    const trimmed = name.trim();
    if (saving) return;
    if (!canSave) {
      setSaveError(!trimmed ? 'Digite o nome da rotina.' : !categoryId ? 'Escolha uma categoria.'
        : rexList.length === 0 ? 'Adicione um exercício para salvar a rotina.'
        : 'Confira as séries e preencha o máximo de treino dos exercícios em 5/3/1.');
      return;
    }

    setSaveError('');
    setSaving(true);
    try {
      // Strip _key antes de persistir
      const exs: RoutineExercise[] = rexList.map(({ _key: _k, ...rest }) => rest);
      await upsertRoutine({
        ...(isNew ? {} : { id }),
        name: trimmed,
        categoryId,
        note: note.trim() || undefined,
        exercises: exs,
        order: 0,
      }, { mustExist: !isNew });
      navigate('/treinos');
    } catch (error) {
      setSaveError(error instanceof Error && error.message === 'Esta rotina já foi excluída.'
        ? error.message : 'Não foi possível salvar a rotina. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew || id === undefined) return;
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await deleteRoutine(id);
      navigate('/treinos', { replace: true });
    } catch {
      setSaveError('Não foi possível excluir a rotina. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const validExercises = rexList.length > 0 && rexList.every((rex) => Number.isInteger(rex.sets) && rex.sets > 0 && rex.sets <= 20
    && exerciseMap.has(rex.exerciseId) && (rex.progression !== '531' || (rex.trainingMaxKg ?? 0) > 0));
  const canSave = name.trim().length > 0 && categoryId !== '' && validExercises;
  const canGroup = selectedKeys.size >= 2;

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <button type="button"
          className="icon-btn"
          onClick={() => navigate('/treinos')}
          aria-label="Voltar"
          style={{ width: 40, height: 40 }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="brand" style={{ flex: 1 }}>
          <h1>{isNew ? 'Nova rotina' : 'Editar rotina'}</h1>
        </div>
        <button
          className="btn"
          type="submit"
          form="routine-form"
          disabled={saving}
        >
          <Save size={15} />
          {saving ? 'Salvando…' : 'Salvar rotina'}
        </button>
      </div>

      {saveError && <p className="feedback error routine-save-error" role="alert">{saveError}</p>}
      <form id="routine-form" className="routine-editor-layout" onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}>
        <div className="routine-editor-side">
      {/* Dados básicos */}
      <div className="card">
        <h2 className="panel-title">Dados da rotina</h2>
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="routine-name">Nome da rotina</label>
          <input id="routine-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={isNew}
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="routine-category">Categoria</label>
          <select id="routine-category" required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categoryId === '' && <option value="">Selecionar…</option>}
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(categories ?? []).length === 0 && (
            <span className="hint">Crie uma categoria em Treinos primeiro.</span>
          )}
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="routine-note">Nota (opcional)</label>
          <textarea id="routine-note"
            placeholder="Observações sobre este treino…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {/* G7: preview muscular da rotina */}
      {hasAnyVolume && (
        <div className="card muscle-preview-card">
          <h2 className="panel-title">O que esta rotina treina</h2>
          <MuscleMap volumeByMuscle={volumeByMuscle} preview />
        </div>
      )}

        </div>
        <section className="routine-editor-exercises" aria-label="Exercícios da rotina">
      {/* Exercícios */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Exercícios</div>

        {/* G2: botão agrupar em superset */}
        {selectedKeys.size > 0 && (
          <button type="button"
            className={`btn${canGroup ? '' : ' ghost'}`}
            onClick={groupSelected}
            disabled={!canGroup}
            style={{ padding: '8px 14px', fontSize: 12 }}
            title={canGroup ? 'Agrupar em superset' : 'Selecione ao menos 2 exercícios'}
          >
            <Link2 size={14} />
            Superset ({selectedKeys.size})
          </button>
        )}
      </div>

      {selectedKeys.size === 1 && (
        <p className="hint" style={{ fontSize: 11, marginBottom: 8, marginTop: -4 }}>
          Selecione mais 1 exercício para criar um superset.
        </p>
      )}

      <div className="rex-list">
        {rexList.map((rex, i) => {
          const info = exerciseMap.get(rex.exerciseId);
          if (info === undefined) return null;
          return (
            <RexRow
              key={rex._key}
              rex={rex}
              mode={info.mode}
              exName={info.name}
              demo={info.demo}
              index={i}
              total={rexList.length}
              selected={selectedKeys.has(rex._key)}
              onToggleSelect={toggleSelect}
              onChange={patchRex}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onRemove={removeRex}
              onUngroup={ungroupRex}
              onDeriveTM={deriveTM}
            />
          );
        })}
      </div>

      {!validExercises && rexList.length > 0 && <p className="feedback error">Revise os exercícios, o número de séries e o training max dos exercícios 5/3/1.</p>}
      {rexList.length === 0 && (
        <div className="empty" style={{ padding: '24px 0' }}>
          <p>Nenhum exercício adicionado ainda.</p>
        </div>
      )}

      <button type="button"
        className="btn ghost"
        onClick={() => setPickerOpen(true)}
        style={{ width: '100%', justifyContent: 'center', marginBottom: 24 }}
      >
        <Plus size={16} />
        Adicionar exercício
      </button>

        </section>
      </form>

      {/* Danger zone — só em edição */}
      {!isNew && (
        <div className="danger-zone">
          <p>Esta ação é irreversível. A rotina será removida do plano semanal se estiver associada.</p>
          {!confirmDelete ? (
            <button
              className="btn ghost"
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Trash2 size={15} />
              Excluir rotina
            </button>
          ) : (
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
              <button className="btn danger" disabled={saving} onClick={() => { void handleDelete(); }}>
                <Trash2 size={15} />
                Confirmar exclusão
              </button>
            </div>
          )}
        </div>
      )}

      {/* Seletor de exercício */}
      {pickerOpen && (
        <ExPicker
          onSelect={addExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
