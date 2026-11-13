/**
 * normalize.ts — utilitário compartilhado de normalização de texto.
 *
 * Extraído de importers.ts para ser reutilizado em starter-plans e
 * qualquer outro módulo que precise casar nomes de exercícios contra
 * o catálogo local.
 */

/**
 * Normaliza o nome de um exercício para comparação sem distinção de
 * maiúsculas, acentos ou pontuação.
 *
 * Exemplos:
 *   "Barbell Squat"    → "barbell squat"
 *   "Développé"        → "developpe"  (sem acentos)
 *   "Pull-up"          → "pullup"      (sem pontuação)
 */
export function normalizeExName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (combining characters)
    .replace(/[^a-z0-9 ]/g, '')      // só letras, dígitos e espaço
    .replace(/\s+/g, ' ')
    .trim();
}
