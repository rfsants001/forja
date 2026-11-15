import { useT } from '../lib/i18n';
import '../styles/setup.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, X, Pencil, Trash2, ChevronRight, Image as ImageIcon } from 'lucide-react';
import type { Exercise, ExerciseMode, MuscleGroup } from '@forja/core';
import { db } from '../db/db';
import { upsertExercise, deleteExercise, updateSettings } from '../db/repo';
import {
  MUSCLE_OPTIONS,
  MODE_OPTIONS,
} from '../lib/labels';
import { hasExerciseMedia, Media } from '../components/Media';
import { MuscleCoverage } from '../components/MuscleCoverage';
import { normalizeExName } from '../lib/normalize';

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
const EQUIP_FILTERS = [
  { label: 'Barra', terms: ['barra', 'barra ez', 'barra olimpica', 'barra hexagonal'] },
  { label: 'Barra fixa', terms: ['barra fixa'] },
  { label: 'Halteres', terms: ['halter', 'halteres'] },
  { label: 'Cabo', terms: ['polia', 'cabo'] },
  { label: 'Máquina', terms: ['maquina', 'smith machine', 'maquina articulada'] },
  { label: 'Peso corporal', terms: ['peso corporal'] },
  { label: 'Elástico', terms: ['elastica', 'elastico', 'faixa elastica', 'faixa de resistencia'] },
  { label: 'Kettlebell', terms: ['kettlebell'] },
  { label: 'Banco', terms: ['banco'] },
] as const;
const INVENTORY_TERMS = new Map<string, string>(EQUIP_FILTERS.flatMap((group) =>
  group.terms.map((term) => [term, group.terms[0]])));


// Performance: exibe 50 itens + "carregar mais" para suportar 1324+ exercícios.
// A busca/filtro opera sobre o conjunto completo; a paginação só afeta a exibição.
const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function Exercicios() {
  const t = useT();
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);

  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const muscleParam = searchParams.get('muscle');
  const muscleFilter = MUSCLE_OPTIONS.find((muscle) => muscle === muscleParam) ?? null;
  function setMuscleFilter(muscle: MuscleGroup | null) {
    setSearchParams((params) => {
      if (muscle === null) params.delete('muscle');
      else params.set('muscle', muscle);
      return params;
    }, { replace: true });
  }
  const [equipFilter, setEquipFilter] = useState<string | null>(null);
  const [onlyIllustrated, setOnlyIllustrated] = useState(false);
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const [onlyMyEquipment, setOnlyMyEquipment] = useState(false);
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const savedEquipment = settings?.gymEquipment;
  const [equipmentChanges, setEquipmentChanges] = useState<Record<string, boolean>>({});
  const [equipmentError, setEquipmentError] = useState(false);
  const myEquipment = useMemo(() => {
    const selected = new Set(savedEquipment);
    for (const [term, checked] of Object.entries(equipmentChanges)) {
      if (checked) selected.add(term);
      else selected.delete(term);
    }
    return selected;
  }, [savedEquipment, equipmentChanges]);
  useEffect(() => {
    setEquipmentChanges((changes) => {
      const pending = Object.entries(changes).filter(([term, checked]) => (savedEquipment?.includes(term) ?? false) !== checked);
      return pending.length === Object.keys(changes).length ? changes : Object.fromEntries(pending);
    });
  }, [savedEquipment]);
  async function toggleEquipment(term: string, checked: boolean) {
    setEquipmentChanges((changes) => ({ ...changes, [term]: checked }));
    setEquipmentError(false);
    try {
      await db.transaction('rw', db.settings, async () => {
        const selected = new Set((await db.settings.get('app'))?.gymEquipment);
        if (checked) selected.add(term);
        else selected.delete(term);
        await updateSettings({ gymEquipment: [...selected] });
      });
    } catch {
      setEquipmentChanges((changes) => {
        const next = { ...changes };
        if (next[term] === checked) delete next[term];
        return next;
      });
      setEquipmentError(true);
    }
  }
  // Paginação — reset quando filtros mudam
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Formulário / sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [form, setForm] = useState<ExForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const editDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = editDialog.current;
    if (sheetOpen && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('#exercise-name')?.focus();
    }
  }, [sheetOpen]);

  // Detalhe / modal de visualização (G1)
  const [detailEx, setDetailEx] = useState<Exercise | null>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (detailEx && detailDialog.current && !detailDialog.current.open) detailDialog.current.showModal();
  }, [detailEx]);
  // Nota por exercício (G15) — estado local dentro do modal de detalhe
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);

  // ---------------------------------------------------------------------------
  // Filtro em memória — opera sobre conjunto completo
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const all = exercises ?? [];
    const q = normalizeExName(query);
    const equipment = EQUIP_FILTERS.find((filter) => filter.label === equipFilter);
    const matching = all.filter((ex) => {
      if (q.length > 0 && !normalizeExName(ex.name).includes(q)) return false;
      if (muscleFilter !== null && ex.primaryMuscle !== muscleFilter
        && !(includeSecondary && ex.secondaryMuscles.includes(muscleFilter))) return false;
      if (onlyIllustrated && !hasExerciseMedia(ex.id, ex.demo)) return false;
      if (onlyMyEquipment && !ex.equipment.every((item) => {
        const name = normalizeExName(item);
        const equipment = INVENTORY_TERMS.get(name);
        return name === 'peso corporal' || (equipment !== undefined && myEquipment.has(equipment));

      })) return false;
      if (equipment && !ex.equipment.some((item) => equipment.terms.some((term) => normalizeExName(item) === term))) {
        return false;
      }
      return true;
    });
    if (q.length > 0) return matching;
    return matching.sort((first, second) => Number(hasExerciseMedia(second.id, second.demo))
      - Number(hasExerciseMedia(first.id, first.demo)));
  }, [exercises, query, muscleFilter, equipFilter, onlyIllustrated, includeSecondary, onlyMyEquipment, myEquipment]);

  // Itens visíveis (paginação)
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  // Reset paginação ao mudar filtros
  function resetPaging() {
    setVisibleCount(PAGE_SIZE);
  }

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
    setFormError('');
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
    if (saving) return;
    if (name.length === 0) {
      setFormError(t('ui.enterExerciseName'));
      document.getElementById('exercise-name')?.focus();
      return;
    }

    setFormError('');
    setSaving(true);
    try {
      const equipment = form.equipment
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await upsertExercise({
        ...(editing !== null ? { ...editing } : {}),
        name,
        mode: form.mode,
        primaryMuscle: form.primaryMuscle,
        secondaryMuscles: form.secondaryMuscles.filter((muscle) => muscle !== form.primaryMuscle),
        equipment,
        demo: editing?.demo ?? { kind: 'none' },
        instructions: form.instructions.trim() || undefined,
        custom: true,
      });
      closeSheet();
    } catch {
      setFormError(t('ui.saveExerciseFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteTarget === null) return;
    await deleteExercise(deleteTarget.id);
    setDeleteTarget(null);
  }

  /** Salva a nota pessoal do exercício (G15). */
  async function handleSaveNote(ex: Exercise) {
    setSavingNote(true);
    try {
      await upsertExercise({ ...ex, note: noteText.trim() || undefined });
      // Atualiza o estado local do modal com a nota salva
      setDetailEx((prev) => (prev !== null ? { ...prev, note: noteText.trim() || undefined } : prev));
    } finally {
      setSavingNote(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <h1>{t("ex.title")}</h1>
        </div>
        <button className="btn" onClick={openNew}>
          <Plus size={16} strokeWidth={2.8} />{t("ex.newBtn")}</button>
      </div>

      <div className="catalog-layout">
        <section className="card catalog-filters" aria-labelledby="catalog-filter-title">
        <h2 className="panel-title" id="catalog-filter-title">{t("ui.filterExercises")}</h2>
        <div className="search-bar" style={{ marginBottom: 12 }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder={t("ex.searchPh")}
            aria-label={t("ui.findExercise")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); resetPaging(); }}
          />
          {query.length > 0 && (
            <button aria-label={t("ui.clearSearch")} onClick={() => { setQuery(''); resetPaging(); }} style={{ color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="catalog-filter">
          <label htmlFor="catalog-muscle">{t("ui.muscleGroup")}</label>
          <select id="catalog-muscle" value={muscleFilter ?? ''} onChange={(event) => {
            setMuscleFilter(MUSCLE_OPTIONS.find((muscle) => muscle === event.target.value) ?? null);
            resetPaging();
          }}>
            <option value="">{t("ex.all")}</option>
            {MUSCLE_OPTIONS.map((muscle) => <option key={muscle} value={muscle}>{t(`muscle.${muscle}`)}</option>)}
          </select>
          {muscleFilter && (
            <label className="catalog-check"><input type="checkbox" checked={includeSecondary} onChange={(event) => {
              setIncludeSecondary(event.target.checked);
              resetPaging();
            }} />{t("ui.includeOtherMuscles")}</label>
          )}
        </div>
        <div className="catalog-filter">
          <label htmlFor="catalog-equipment">{t("ex.fieldEquipment")}</label>
          <select id="catalog-equipment" value={equipFilter ?? ''} onChange={(event) => {
            setEquipFilter(event.target.value || null);
            resetPaging();
          }}>
            <option value="">{t("ex.all")}</option>
            {EQUIP_FILTERS.map((equipment) => <option key={equipment.label} value={equipment.label}>{equipment.label}</option>)}
          </select>
        </div>
        <details className="catalog-inventory">
          <summary>{t("ui.myEquipment")}</summary>
          <div className="catalog-inventory-options">
            {EQUIP_FILTERS.filter((group) => group.terms[0] !== 'peso corporal').map((group) => (
              <label key={group.label} className="catalog-check">
                <input type="checkbox" checked={myEquipment.has(group.terms[0])}
                  disabled={!settings} onChange={(event) => void toggleEquipment(group.terms[0], event.target.checked)} />
                {group.label}
              </label>
            ))}
          </div>
          <label className="catalog-check"><input type="checkbox" checked={onlyMyEquipment} onChange={(event) => {
            setOnlyMyEquipment(event.target.checked);
            resetPaging();
          }} />{t("ui.applyMyEquipment")}</label>
          <p className="hint">{t("ui.bodyWeightIncluded")}</p>
          {equipmentError && <p className="feedback error" role="alert">{t("ui.equipmentSaveError")}</p>}
        </details>
        <label className="catalog-check catalog-illustrated"><input type="checkbox" checked={onlyIllustrated} onChange={(event) => {
          setOnlyIllustrated(event.target.checked);
          resetPaging();
        }} /> <ImageIcon size={15} aria-hidden="true" />{t("ui.withDemo")}</label>
      </section>
        <section className="catalog-results" aria-label={t("ui.catalogResults")}>
        {/* Contador */}
        {filtered.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            {filtered.length} exercício{filtered.length !== 1 ? 's' : ''}
            {hasMore ? ` — mostrando ${visibleCount}` : ''}
          </p>
        )}

        {/* Lista */}
        {filtered.length === 0 ? (
          <div className="empty">
            <Media demo={{ kind: 'none' }} name="" size="lg" />
            <p style={{ marginTop: 12 }}>
              {(exercises ?? []).length === 0
                ? t("ex.empty")
                : t("ex.noResults")}
            </p>
            {(exercises ?? []).length === 0 && (
              <button className="btn" style={{ marginTop: 16 }} onClick={openNew}>
                <Plus size={16} />{t("ex.newBtn")}</button>
            )}
          </div>
        ) : (
          <>
            <div className="ex-list">
              {visible.map((ex) => (
                <div
                  key={ex.id}
                  className="ex-item"
                  onClick={() => { setDetailEx(ex); setNoteText(ex.note ?? ''); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetailEx(ex); setNoteText(ex.note ?? ''); } }}
                >
                  {/* G1: miniatura da demo */}
                  <Media exerciseId={ex.id} demo={ex.demo} name={ex.name} size="sm" staticOnly />
                  <div className="ex-info">
                    <div className="ex-name">{ex.name}</div>
                    <div className="ex-meta">
                      {t(`muscle.${ex.primaryMuscle}`)}
                      {ex.equipment.length > 0 && ` · ${ex.equipment.join(', ')}`}
                      {' · '}
                      {t(`mode.${ex.mode}`)}
                    </div>
                  </div>
                  {ex.custom === true && (
                    <span className="ex-badge">{t("ui.custom")}</span>
                  )}
                  {ex.note !== undefined && ex.note.length > 0 && (
                    <span className="ex-badge" title={ex.note}>{t("ex.noteBadge")}</span>
                  )}
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              ))}
            </div>

            {/* Carregar mais */}
            {hasMore && (
              <button
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                {t('ui.moreExercises', [filtered.length - visibleCount])}
              </button>
            )}
          </>
        )}

        </section>
      </div>

      {/* G1: modal de detalhe do exercício */}
      {detailEx !== null && (
        <dialog className="sheet exercise-detail" ref={detailDialog} aria-labelledby="exercise-detail-title"
          onClose={() => setDetailEx(null)} onClick={(event) => {
            if (event.target === event.currentTarget) detailDialog.current?.close();
          }}>
          <div className="exercise-detail-inner">
            <header className="exercise-detail-heading">
              <div>
                <p className="hint">{t(`mode.${detailEx.mode}`)}</p>
                <h2 id="exercise-detail-title">{detailEx.name}</h2>
              </div>
              <button type="button" className="btn ghost" aria-label={t("ui.closeDetails")}
                onClick={() => detailDialog.current?.close()}><X size={18} aria-hidden="true" /></button>
            </header>
            <div className="exercise-detail-visuals">
              {hasExerciseMedia(detailEx.id, detailEx.demo) && (
                <section aria-label={t("ui.demonstration")} className="exercise-demo-panel">
                  <Media exerciseId={detailEx.id} demo={detailEx.demo} name={detailEx.name} size="xl" />
                </section>
              )}
              <section className="exercise-muscles" aria-label={t("tg.musclesInvolved")}>
                <MuscleCoverage figure={settings?.muscleFigure}
                  primary={[detailEx.primaryMuscle]} secondary={detailEx.secondaryMuscles} />
              </section>
            </div>

            {detailEx.equipment.length > 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                <strong>{t("ex.equipmentLabel")}</strong> {detailEx.equipment.join(', ')}
              </p>
            )}

            {detailEx.instructions !== undefined && detailEx.instructions.length > 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 16 }}>
                {detailEx.instructions}
              </p>
            )}

            {/* Nota pessoal (G15) */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="exercise-personal-note">{t("ex.personalNote")}</label>
              <textarea
                id="exercise-personal-note"
                placeholder={t("ex.notePh")}
                value={noteText}
                rows={3}
                onChange={(e) => setNoteText(e.target.value)}
              />
              {noteText !== (detailEx.note ?? '') && (
                <button
                  className="btn"
                  style={{ marginTop: 6, padding: '7px 14px', fontSize: 12 }}
                  onClick={() => { void handleSaveNote(detailEx); }}
                  disabled={savingNote}
                >
                  {savingNote ? t("ex.savingNote") : t("ex.saveNote")}
                </button>
              )}
            </div>

            <div className="btn-row">
              <button className="btn ghost" onClick={() => detailDialog.current?.close()}>{t("ex.close")}</button>
              {detailEx.custom === true && (
                <>
                  <button
                    className="btn ghost"
                    onClick={() => { openEdit(detailEx); setDetailEx(null); }}
                  >
                    <Pencil size={15} />{t("ex.edit")}</button>
                  <button
                    className="btn danger"
                    onClick={() => { setDeleteTarget(detailEx); setDetailEx(null); }}
                  >
                    <Trash2 size={15} />{t("ex.delete")}</button>
                </>
              )}
            </div>
          </div>
        </dialog>
      )}

      {sheetOpen && (
        <dialog ref={editDialog} className="sheet form-dialog" aria-labelledby="exercise-form-title"
          onClose={closeSheet} onCancel={(event) => { if (saving) event.preventDefault(); }}>
          <form onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
            <header className="form-dialog-heading">
              <h2 id="exercise-form-title">{editing ? t("ex.editTitle") : t("ex.newBtn")}</h2>
              <button type="button" className="icon-btn" disabled={saving} aria-label={t("ui.closeForm")}
                onClick={() => editDialog.current?.close()}><X size={17} aria-hidden="true" /></button>
            </header>
            <fieldset className="field-grid form-fields" disabled={saving}>
              <div className="field full">
                <label htmlFor="exercise-name">{t("ui.exerciseName")}</label>
                <input id="exercise-name" type="text" value={form.name} required
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="exercise-mode">{t("ui.recordType")}</label>
                <select id="exercise-mode" value={form.mode}
                  onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value as ExerciseMode }))}>
                  {MODE_OPTIONS.map((mode) => <option key={mode} value={mode}>{t(`mode.${mode}`)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="exercise-primary">{t("ui.primaryMuscle")}</label>
                <select id="exercise-primary" value={form.primaryMuscle} onChange={(event) => {
                  const primaryMuscle = event.target.value as MuscleGroup;
                  setForm((current) => ({
                    ...current, primaryMuscle, secondaryMuscles: current.secondaryMuscles.filter((muscle) => muscle !== primaryMuscle),
                  }));
                }}>
                  {MUSCLE_OPTIONS.map((muscle) => <option key={muscle} value={muscle}>{t(`muscle.${muscle}`)}</option>)}
                </select>
              </div>
              <fieldset className="field full">
                <legend>{t("ui.secondaryMuscles")} <small className="hint">{t("ui.optional")}</small></legend>
                <div className="form-chips">
                  {MUSCLE_OPTIONS.filter((muscle) => muscle !== form.primaryMuscle).map((muscle) => (
                    <button key={muscle} type="button" className="chip"
                      aria-pressed={form.secondaryMuscles.includes(muscle)}
                      onClick={() => toggleSecondary(muscle)}>{t(`muscle.${muscle}`)}</button>
                  ))}
                </div>
              </fieldset>
              <div className="field full">
                <label htmlFor="exercise-equipment">{t("ex.fieldEquipment")} <small className="hint">{t("ui.optional")}</small></label>
                <input id="exercise-equipment" type="text" value={form.equipment} aria-describedby="exercise-equipment-help"
                  onChange={(event) => setForm((current) => ({ ...current, equipment: event.target.value }))} />
                <span id="exercise-equipment-help" className="hint">{t("ui.equipmentHelp")}</span>
              </div>
              <div className="field full">
                <label htmlFor="exercise-instructions">{t("tg.exerciseGuide")} <small className="hint">{t("ui.optional")}</small></label>
                <textarea id="exercise-instructions" value={form.instructions} rows={3}
                  onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} />
              </div>
            </fieldset>
            {formError && <p className="field-error" role="alert">{formError}</p>}
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => editDialog.current?.close()} disabled={saving}>{t("ex.cancel")}</button>
              <button type="submit" className="btn" disabled={saving}>{saving ? t("ex.savingNote") : t("ui.saveExercise")}</button>
            </div>
          </form>
        </dialog>
      )}

      {/* Confirmação de exclusão */}
      {deleteTarget !== null && (
        <div
          className="sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="sheet">
            <div className="sheet-handle" />
            <h2>{t("ex.deleteTitle")}</h2>
            <p style={{ color: 'var(--text-2)', marginBottom: 20, fontSize: 14 }}>
              <strong>{deleteTarget.name}</strong>{t("ui.exerciseRemoved")}</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>{t("ex.cancel")}</button>
              <button className="btn danger" onClick={() => { void handleDelete(); }}>
                <Trash2 size={15} />{t("ex.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
