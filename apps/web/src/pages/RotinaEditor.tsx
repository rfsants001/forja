import '../styles/setup.css';
import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import type { RoutineExercise, ProgressionPolicy, ExerciseMode, MuscleGroup } from '@forja/core';
import { db } from '../db/db';
import { upsertRoutine, deleteRoutine } from '../db/repo';
import {
  MUSCLE_LABEL,
  MODE_LABEL,
  PROGRESSION_LABEL,
  PROGRESSION_OPTIONS,
  MUSCLE_OPTIONS,
} from '../lib/labels';

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

interface RexDraft extends RoutineExercise {
  /** key estável para a lista (exerciseId pode repetir em supersets futuros) */
  _key: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newKey() {
  return Math.random().toString(36).slice(2, 9);
}

// ---------------------------------------------------------------------------
// Sub-componente: Seletor de exercícios (modal)
// ---------------------------------------------------------------------------

interface ExPickerProps {
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}

function ExPicker({ onSelect, onClose }: ExPickerProps) {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);

  const filtered = useMemo(() => {
    const all = exercises ?? [];
    const q = query.toLowerCase().trim();
    return all.filter((ex) => {
      if (q.length > 0 && !ex.name.toLowerCase().includes(q)) return false;
      if (muscleFilter !== null && ex.primaryMuscle !== muscleFilter) return false;
      return true;
    });
  }, [exercises, query, muscleFilter]);

  return (
    <div
      className="ex-picker-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ex-picker">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Adicionar exercício</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Busca */}
        <div className="search-bar">
          <Search size={15} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query.length > 0 && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
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

        {/* Lista */}
        <div className="ex-picker-list">
          {filtered.map((ex) => (
            <div
              key={ex.id}
              className="ex-item selectable"
              onClick={() => { onSelect(ex.id); onClose(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') { onSelect(ex.id); onClose(); } }}
            >
              <div className="ex-info">
                <div className="ex-name">{ex.name}</div>
                <div className="ex-meta">
                  {MUSCLE_LABEL[ex.primaryMuscle]} · {MODE_LABEL[ex.mode]}
                </div>
              </div>
              <Plus size={16} color="var(--flame)" />
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
              Nenhum exercício encontrado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: linha de configuração de um RoutineExercise
// ---------------------------------------------------------------------------

interface RexRowProps {
  rex: RexDraft;
  mode: ExerciseMode;
  exName: string;
  index: number;
  total: number;
  onChange: (key: string, patch: Partial<RoutineExercise>) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
  onRemove: (key: string) => void;
}

function RexRow({ rex, mode, exName, index, total, onChange, onMoveUp, onMoveDown, onRemove }: RexRowProps) {
  return (
    <div className="rex-item">
      <div className="rex-item-header">
        <span className="rex-name">{exName}</span>
        <span className="rex-mode">{MODE_LABEL[mode]}</span>
      </div>

      <div className="rex-controls">
        {/* Sets */}
        <div className="field">
          <label>Séries</label>
          <input
            type="number"
            min={1}
            max={20}
            value={rex.sets}
            onChange={(e) => onChange(rex._key, { sets: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
        </div>

        {/* Target — reps ou tempo */}
        {mode === 'time' || mode === 'cardio' ? (
          <div className="field">
            <label>Tempo (seg)</label>
            <input
              type="number"
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
        ) : (
          <div className="field">
            <label>Reps-alvo</label>
            <input
              type="text"
              placeholder="Ex.: 8–12"
              value={rex.targetReps ?? ''}
              onChange={(e) => onChange(rex._key, { targetReps: e.target.value || undefined })}
            />
          </div>
        )}

        {/* Descanso */}
        <div className="field">
          <label>Descanso (seg)</label>
          <input
            type="number"
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

        {/* Incremento */}
        <div className="field">
          <label>Incremento (kg)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            placeholder="Ex.: 2.5"
            value={rex.incrementKg ?? ''}
            onChange={(e) =>
              onChange(rex._key, {
                incrementKg: e.target.value === '' ? undefined : parseFloat(e.target.value),
              })
            }
          />
        </div>

        {/* Progressão */}
        <div className="field full">
          <label>Progressão</label>
          <select
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
      </div>

      {/* Ações da linha */}
      <div className="rex-actions">
        <button
          className="icon-btn"
          disabled={index === 0}
          onClick={() => onMoveUp(rex._key)}
          aria-label="Mover para cima"
        >
          <ChevronUp size={15} />
        </button>
        <button
          className="icon-btn"
          disabled={index === total - 1}
          onClick={() => onMoveDown(rex._key)}
          aria-label="Mover para baixo"
        >
          <ChevronDown size={15} />
        </button>
        <button
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

  // Map exerciseId → Exercise para lookup rápido
  const exerciseMap = useMemo(() => {
    const map = new Map<string, { name: string; mode: ExerciseMode }>();
    (exercises ?? []).forEach((ex) => map.set(ex.id, { name: ex.name, mode: ex.mode }));
    return map;
  }, [exercises]);

  // Estado do formulário
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [rexList, setRexList] = useState<RexDraft[]>([]);

  const [saving, setSaving] = useState(false);
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
  }

  // ---------------------------------------------------------------------------
  // Salvar / excluir
  // ---------------------------------------------------------------------------

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length === 0 || categoryId === '') return;

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
      });
      navigate('/treinos');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew || id === undefined) return;
    await deleteRoutine(id);
    navigate('/treinos', { replace: true });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canSave = name.trim().length > 0 && categoryId !== '';

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <button
          className="icon-btn"
          onClick={() => navigate('/treinos')}
          aria-label="Voltar"
          style={{ width: 40, height: 40 }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="brand" style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20 }}>{isNew ? 'Nova rotina' : 'Editar rotina'}</h1>
        </div>
        <button
          className="btn"
          onClick={() => { void handleSave(); }}
          disabled={saving || !canSave}
          style={{ padding: '10px 16px', fontSize: 13 }}
        >
          <Save size={15} />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {/* Dados básicos */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Nome da rotina *</label>
          <input
            type="text"
            placeholder="Ex.: Peito e Tríceps"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={isNew}
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Categoria *</label>
          <select
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
          <label>Nota (opcional)</label>
          <textarea
            placeholder="Observações sobre este treino…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {/* Exercícios */}
      <div className="section-title">Exercícios</div>

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
              index={i}
              total={rexList.length}
              onChange={patchRex}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onRemove={removeRex}
            />
          );
        })}
      </div>

      {rexList.length === 0 && (
        <div className="empty" style={{ padding: '24px 0' }}>
          <p>Nenhum exercício adicionado ainda.</p>
        </div>
      )}

      <button
        className="btn ghost"
        onClick={() => setPickerOpen(true)}
        style={{ width: '100%', justifyContent: 'center', marginBottom: 24 }}
      >
        <Plus size={16} />
        Adicionar exercício
      </button>

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
              <button className="btn danger" onClick={() => { void handleDelete(); }}>
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
