import type { EquipmentItem, Exercise, Settings } from '@forja/core';
import { normalizeExName } from './normalize.ts';

export const EQUIP_FILTERS = [
  { key: 'equip.bar', terms: ['barra reta', 'barras retas', 'barra olimpica', 'barra olimpica reta', 'barbell', 'straight barbell'] },
  { key: 'equip.ezBar', terms: ['barra ez', 'barras ez', 'barra w', 'barras w', 'barra z', 'ez bar', 'ez curl bar'] },
  { key: 'equip.trapBar', terms: ['barra hexagonal', 'barras hexagonais', 'trap bar', 'hex bar'] },
  { key: 'equip.pullupBar', terms: ['barra fixa', 'barras fixas', 'barra de porta', 'barra fixa de porta', 'pullup bar', 'pull up bar'] },
  { key: 'equip.plates', terms: ['anilha', 'anilhas', 'weight plate', 'weight plates', 'plate', 'plates'] },
  { key: 'equip.dumbbells', terms: ['halter', 'halteres', 'haltere', 'dumbbell', 'dumbbells', 'halter ajustavel', 'halteres ajustaveis', 'halter montavel', 'halteres montaveis', 'barra de halter', 'barras de halter', 'barra de haltere', 'barras de haltere', 'barra de halteres', 'barras de halteres', 'adjustable dumbbell', 'adjustable dumbbells', 'dumbbell handle', 'dumbbell handles'] },
  { key: 'equip.cable', terms: ['polia', 'cabo', 'cable machine'] },
  { key: 'equip.machine', terms: ['maquina', 'maquina articulada'] },
  { key: 'equip.smith', terms: ['smith machine', 'maquina smith'] },
  { key: 'equip.bodyweight', terms: ['peso corporal', 'bodyweight', 'body weight'] },
  { key: 'equip.band', terms: ['elastica', 'elastico', 'elasticos', 'faixa elastica', 'faixas elasticas', 'faixa de resistencia', 'resistance band', 'resistance bands'] },
  { key: 'equip.kettlebell', terms: ['kettlebell', 'kettlebells'] },
  { key: 'equip.bench', terms: ['banco', 'banco reto', 'flat bench', 'bench'] },
  { key: 'equip.inclineBench', terms: ['banco inclinado', 'incline bench'] },
  { key: 'equip.adjustableBench', terms: ['banco regulavel', 'banco ajustavel', 'adjustable bench'] },
  { key: 'equip.declineBench', terms: ['banco declinado', 'decline bench'] },
  { key: 'equip.rack', terms: ['rack', 'rack de agachamento', 'power rack', 'squat rack', 'suporte para barra'] },
  { key: 'equip.dipBars', terms: ['paralelas', 'barras paralelas', 'dip bars'] },
  { key: 'equip.sliders', terms: ['disco deslizante', 'discos deslizantes', 'slider', 'sliders'] },
  { key: 'equip.pushupHandles', terms: ['apoio de flexao', 'apoios de flexao', 'suporte de flexao', 'suportes de flexao', 'suporte para flexao', 'suportes para flexao', 'apoio para flexao', 'apoios para flexao', 'pushup handles'] },
  { key: 'equip.backpack', terms: ['mochila', 'mochila com peso', 'weighted backpack', 'backpack'] },
  { key: 'equip.treadmill', terms: ['esteira', 'esteira ergometrica', 'treadmill'] },
  { key: 'equip.exerciseBike', terms: ['bicicleta ergometrica', 'bike ergometrica', 'bicicleta estacionaria', 'spinning', 'exercise bike', 'stationary bike'] },
  { key: 'equip.elliptical', terms: ['eliptico', 'aparelho eliptico', 'elliptical'] },
  { key: 'equip.rower', terms: ['remo ergometrico', 'ergometro de remo', 'rowing machine', 'rower'] },
] as const;

const aliases = new Map<string, string>(EQUIP_FILTERS.flatMap(({ terms }) => terms.map((term) => [term, terms[0]])));

export function equipmentKey(value: string): string {
  // Preserve free-text notes in the inventory, but do not make them part of its type.
  const withoutNotes = value.replace(/\([^)]*\)/g, ' ').trim();
  const name = normalizeExName(withoutNotes);
  if (name === 'barras') return 'barra';
  const withoutWeight = name.replace(/\s+(?:de\s+)?\d+\s*(?:kg|kgs|lb|lbs)$/, '');
  return aliases.get(name) ?? aliases.get(withoutWeight) ?? name;
}

/** Handles become loadable dumbbells only with registered plates. */
function dumbbellHandle(name: string): boolean {
  return /\b(?:barras? de halter(?:e|es)?|dumbbell handles?)\b/.test(normalizeExName(name));
}

export function equipmentItems(settings?: Settings): EquipmentItem[] {
  return settings?.equipmentInventory ?? (settings?.gymEquipment ?? []).map((name, index) => ({ id: 'legacy-' + index, name }));
}

export function hasDumbbellPair(items: readonly EquipmentItem[]): boolean {
  const plates = items.some(({ name }) => equipmentKey(name) === 'anilha');
  const weights = new Map<number | undefined, number>();
  for (const item of items) {
    if (equipmentKey(item.name) !== 'halter') continue;
    if (dumbbellHandle(item.name) && !plates) continue;
    if (item.quantity === undefined) return true;
    const count = (weights.get(item.unitWeightKg) ?? 0) + item.quantity;
    if (count >= 2) return true;
    weights.set(item.unitWeightKg, count);
  }
  return false;
}

export function inventoryKeys(items: readonly string[]): Set<string> {
  const available = new Set(items.map(equipmentKey));
  if (!available.has('anilha') && items.filter(name => equipmentKey(name) === 'halter').every(dumbbellHandle)) available.delete('halter');
  if (available.has('banco regulavel')) {
    available.add('banco');
    available.add('banco inclinado');
  }
  return available;
}

/** The public catalog uses “barra” as shorthand for a straight barbell. */
export function catalogEquipmentKey(value: string): string {
  const key = equipmentKey(value);
  return key === 'barra' ? 'barra reta' : key;
}

export function exerciseRequirements(exercise: Exercise): string[] {
  const requirements = new Set(exercise.equipment.map(catalogEquipmentKey));
  const name = normalizeExName(exercise.name);

  // Some catalog rows describe only the resistance and omit the fixture used.
  if (dumbbellHandle(name)) requirements.add('halter');
  else if (/\b(barra (?:ez|w|z)|ez bar(?:bell)?)\b/.test(name)) requirements.add('barra ez');
  else if (/\b(barra hexagonal|trap bar|hex bar)\b/.test(name)) requirements.add('barra hexagonal');
  else if (/\b(barbell|barra)\b/.test(name) && !/\b(barra fixa|barra de porta|barra paralela)\b/.test(name)) requirements.add('barra reta');
  if (/\b(pullups?|pull ups?|chinups?|chin ups?|dead hang|barra fixa|hanging)\b/.test(name)
      && !requirements.has('maquina') && !requirements.has('polia')) requirements.add('barra fixa');
  if (/\b(bench press|supino|dumbbell fly|crucifixo com halteres?)\b/.test(name)
      && !/\b(floor|chao|solo|ball|bola)\b/.test(name)
      && !requirements.has('maquina') && !requirements.has('polia')) {
    requirements.add(/\b(incline|inclinado)\b/.test(name) ? 'banco inclinado'
      : /\b(decline|declinado)\b/.test(name) ? 'banco declinado' : 'banco');
    if (requirements.has('barra reta') || requirements.has('barra ez')) requirements.add('rack');
  }
  if (/\b(steps? up|stepups?|box jumps?|feet elevated|pes elevados)\b/.test(name)) requirements.add('step');
  if (/\b(bench dips?|mergulho em banco|on bench)\b/.test(name) && !/\b(floor|chao)\b/.test(name)) requirements.add('banco');
  if (/\b(parallel bars|dip bars|on dip|paralelas)\b/.test(name)) requirements.add('paralelas');
  if (requirements.has('barra reta') && /\b(squats?|agachamento|rack pull)\b/.test(name)) requirements.add('rack');
  if (/\b(dumbbells?|halter(?:e|es)?)\b/.test(name)) requirements.add('halter');
  if (/\b(weight plates?|anilha|anilhas)\b/.test(name)) requirements.add('anilha');
  return [...requirements];
}

export function supportsEquipment(requirements: readonly string[], available: ReadonlySet<string>): boolean {
  return requirements.every((key) => key === 'peso corporal' || available.has(key));
}
