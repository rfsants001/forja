import { normalizeExName } from './normalize';

// Equipamentos frequentes para sugestão de chips
export const EQUIP_FILTERS = [
  { label: 'Barra', key: 'equip.bar', terms: ['barra', 'barra ez', 'barra olimpica', 'barra hexagonal'] },
  { label: 'Barra fixa', key: 'equip.pullupBar', terms: ['barra fixa'] },
  { label: 'Halteres', key: 'equip.dumbbells', terms: ['halter', 'halteres'] },
  { label: 'Cabo', key: 'equip.cable', terms: ['polia', 'cabo'] },
  { label: 'Máquina', key: 'equip.machine', terms: ['maquina', 'smith machine', 'maquina articulada'] },
  { label: 'Peso corporal', key: 'equip.bodyweight', terms: ['peso corporal'] },
  { label: 'Elástico', key: 'equip.band', terms: ['elastica', 'elastico', 'faixa elastica', 'faixa de resistencia'] },
  { label: 'Kettlebell', key: 'equip.kettlebell', terms: ['kettlebell'] },
  { label: 'Banco', key: 'equip.bench', terms: ['banco'] },
] as const;
const INVENTORY_TERMS = new Map<string, string>(EQUIP_FILTERS.flatMap((group) =>
  group.terms.map((term) => [term, group.terms[0]])));

export function equipmentKey(value: string): string {
  const name = normalizeExName(value);
  return INVENTORY_TERMS.get(name) ?? name;
}

export function supportsEquipment(required: readonly string[], available: ReadonlySet<string>): boolean {
  const keys = new Set([...available].map(equipmentKey));
  return required.every((item) => {
    const key = equipmentKey(item);
    return key === 'peso corporal' || keys.has(key);
  });
}
