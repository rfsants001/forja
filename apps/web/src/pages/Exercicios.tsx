import '../styles/setup.css';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Dumbbell, Search, Plus, X, Pencil, Trash2 } from 'lucide-react';
import type { Exercise, ExerciseMode, MuscleGroup } from '@forja/core';
import { db } from '../db/db';
import { upsertExercise, deleteExercise } from '../db/repo';
import {
  MUSCLE_LABEL,
  MODE_LABEL,
  MUSCLE_OPTIONS,
  MODE_OPTIONS,
} from '../lib/labels';

// ---------------------------------------------------------------------------
// Tipos do formulário
// ---------------------------------------------------------------------------

interface ExForm {
  name: string;
  mode: ExerciseMode;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: string;
  instructions: string;
}

const EMPTY_FORM: ExForm = {
  name: '',
  mode: 'reps',
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  equipment: '',
  instructions: '',
};

// Equipamentos frequentes para sugestão de chips
const EQUIP_FILTERS = ['Barra', 'Halteres', 'Cabo', 'Máquina', 'Peso corporal', 'Elástico'];

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function Exercicios() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);

  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);
  const [equipFilter, setEquipFilter] = useState<string | null>(null);

  // Formulário / sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [form, setForm] = useState<ExForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);

  // ---------------------------------------------------------------------------
  // Filtro em memória (mesma estratégia do repo.searchExercises)
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const all = exercises ?? [];
    const q = query.toLowerCase().trim();
    return all.filter((ex) => {
      if (q.length > 0 && !ex.name.toLowerCase().includes(q)) return false;
      if (muscleFilter !== null && ex.primaryMuscle !== muscleFilter) return false;
      if (equipFilter !== null) {
        const eq = equipFilter.toLowerCase();
        const has = ex.equipment.some((e) => e.toLowerCase().includes(eq));
        if (!has) return false;
      }
      return true;
    });
  }, [exercises, query, muscleFilter, equipFilter]);

  // ---------------------------------------------------------------------------
  // Helpers de formulário
  // ---------------------------------------------------------------------------

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }

  function openEdit(ex: Exercise) {
    setEditing(ex);
    setForm({
      name: ex.name,
      mode: ex.mode,
      primaryMuscle: ex.primaryMuscle,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment.join(', '),
      instructions: ex.instructions ?? '',
    });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function toggleSecondary(m: MuscleGroup) {
    setForm((f) => {
      const next = f.secondaryMuscles.includes(m)
        ? f.secondaryMuscles.filter((x) => x !== m)
        : [...f.secondaryMuscles, m];
      return { ...f, secondaryMuscles: next };
    });
  }

  async function handleSave() {
    const name = form.name.trim();
    if (name.length === 0) return;

    setSaving(true);
    try {
      const equipment = form.equipment
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await upsertExercise({
        ...(editing !== null ? { id: editing.id, createdAt: editing.createdAt } : {}),
        name,
        mode: form.mode,
        primaryMuscle: form.primaryMuscle,
        secondaryMuscles: form.secondaryMuscles,
        equipment,
        demo: { kind: 'none' },
        instructions: form.instructions.trim() || undefined,
        custom: true,
      });
      closeSheet();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteTarget === null) return;
    await deleteExercise(deleteTarget.id);
    setDeleteTarget(null);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <h1>Exercícios</h1>
        </div>
        <button className="btn" onClick={openNew} style={{ padding: '10px 16px', fontSize: 13 }}>
          <Plus size={16} strokeWidth={2.8} />
          Novo
        </button>
      </div>

      {/* Busca */}
      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Search size={16} color="var(--text-muted)" />
        <input
          type="text"
          placeholder="Buscar exercício…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.length > 0 && (
          <button onClick={() => setQuery('')} style={{ color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filtros — grupo muscular */}
      <div className="chip-row" style={{ marginBottom: 8 }}>
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

      {/* Filtros — equipamento */}
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {EQUIP_FILTERS.map((eq) => (
          <button
            key={eq}
            className={`chip${equipFilter === eq ? ' active' : ''}`}
            onClick={() => setEquipFilter(equipFilter === eq ? null : eq)}
          >
            {eq}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="empty">
          <Dumbbell size={40} strokeWidth={1.6} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: 12 }}>
            {(exercises ?? []).length === 0
              ? 'Nenhum exercício encontrado. Adicione o primeiro!'
              : 'Nenhum resultado para esse filtro.'}
          </p>
          {(exercises ?? []).length === 0 && (
            <button className="btn" style={{ marginTop: 16 }} onClick={openNew}>
              <Plus size={16} />
              Novo exercício
            </button>
          )}
        </div>
      ) : (
        <div className="ex-list">
          {filtered.map((ex) => (
            <div key={ex.id} className="ex-item">
              <div className="ex-icon">
                <Dumbbell size={18} strokeWidth={1.8} />
              </div>
              <div className="ex-info">
                <div className="ex-name">{ex.name}</div>
                <div className="ex-meta">
                  {MUSCLE_LABEL[ex.primaryMuscle]}
                  {ex.equipment.length > 0 && ` · ${ex.equipment.join(', ')}`}
                  {' · '}
                  {MODE_LABEL[ex.mode]}
                </div>
              </div>
              {ex.custom === true && (
                <>
                  <span className="ex-badge">Custom</span>
                  <button
                    className="icon-btn"
                    onClick={() => openEdit(ex)}
                    aria-label="Editar exercício"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => setDeleteTarget(ex)}
                    aria-label="Excluir exercício"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sheet — formulário */}
      {sheetOpen && (
        <div
          className="sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}
        >
          <div className="sheet">
            <div className="sheet-handle" />
            <h2>{editing !== null ? 'Editar exercício' : 'Novo exercício'}</h2>

            <div className="field">
              <label>Nome *</label>
              <input
                type="text"
                placeholder="Ex.: Supino reto"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="field">
              <label>Modo</label>
              <select
                value={form.mode}
                onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as ExerciseMode }))}
              >
                {MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{MODE_LABEL[m]}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Músculo primário</label>
              <select
                value={form.primaryMuscle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, primaryMuscle: e.target.value as MuscleGroup }))
                }
              >
                {MUSCLE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Músculos secundários</label>
              <div className="chip-row" style={{ flexWrap: 'wrap' }}>
                {MUSCLE_OPTIONS.filter((m) => m !== form.primaryMuscle).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`chip${form.secondaryMuscles.includes(m) ? ' active' : ''}`}
                    onClick={() => toggleSecondary(m)}
                  >
                    {MUSCLE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Equipamento</label>
              <input
                type="text"
                placeholder="Ex.: Barra, Halteres"
                value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
              />
              <span className="hint">Separe com vírgula.</span>
            </div>

            <div className="field">
              <label>Instruções (opcional)</label>
              <textarea
                placeholder="Descreva a execução…"
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              />
            </div>

            <div className="btn-row">
              <button className="btn ghost" onClick={closeSheet} disabled={saving}>
                Cancelar
              </button>
              <button
                className="btn"
                onClick={() => { void handleSave(); }}
                disabled={saving || form.name.trim().length === 0}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {deleteTarget !== null && (
        <div
          className="sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="sheet">
            <div className="sheet-handle" />
            <h2>Excluir exercício?</h2>
            <p style={{ color: 'var(--text-2)', marginBottom: 20, fontSize: 14 }}>
              <strong>{deleteTarget.name}</strong> será removido da biblioteca. Rotinas que já usam
              este exercício não serão afetadas.
            </p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button className="btn danger" onClick={() => { void handleDelete(); }}>
                <Trash2 size={15} />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
