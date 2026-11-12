// Coordenadas SVG para o mapa muscular simplificado do Forja.
// Viewbox: 0 0 200 340 (frente) e 0 0 200 340 (costas) — lado a lado em 400×340.
// Estilo "silhueta com blocos musculares arredondados": legível em mobile pequeno.
//
// Cada grupo tem paths/formas para a vista frontal e/ou posterior.
// O componente MuscleMap interpola a cor conforme volume relativo.

import type { MuscleGroup } from '@forja/core';

export interface MuscleRegion {
  /** Paths SVG (d="...") para a silhueta da vista frontal. */
  front?: string[];
  /** Paths SVG (d="...") para a silhueta da vista posterior. */
  back?: string[];
}

// ---------------------------------------------------------------------------
// Silhueta de fundo (frente e costas) — representação do torso/membros
// ---------------------------------------------------------------------------

/** Path da silhueta humana simplificada — frente masculina (viewBox 0 0 200 340).
 *  Ombros largos (~132px), cintura média, quadril neutro. */
export const BODY_OUTLINE_FRONT =
  'M100 10 C80 10 68 22 68 38 C68 52 76 62 85 66 L82 90 C72 92 55 98 50 110 L44 160 L38 220 L45 290 L52 330 L60 330 L65 290 L68 240 L72 200 L100 196 L128 200 L132 240 L135 290 L140 330 L148 330 L155 290 L162 220 L156 160 L150 110 C145 98 128 92 118 90 L115 66 C124 62 132 52 132 38 C132 22 120 10 100 10Z M44 110 L28 115 L22 170 L30 175 L38 130 Z M156 110 L172 115 L178 170 L170 175 L162 130 Z';

/** Path da silhueta humana simplificada — costas masculina (viewBox 0 0 200 340). */
export const BODY_OUTLINE_BACK =
  'M100 10 C80 10 68 22 68 38 C68 52 76 62 85 66 L82 90 C72 92 55 98 50 110 L44 160 L38 220 L45 290 L52 330 L60 330 L65 290 L68 240 L72 200 L100 196 L128 200 L132 240 L135 290 L140 330 L148 330 L155 290 L162 220 L156 160 L150 110 C145 98 128 92 118 90 L115 66 C124 62 132 52 132 38 C132 22 120 10 100 10Z M44 110 L28 115 L22 170 L30 175 L38 130 Z M156 110 L172 115 L178 170 L170 175 L162 130 Z';

// ---------------------------------------------------------------------------
// Silhueta feminina — ombros mais estreitos (~122px), quadril mais largo (~144px),
// cintura marcada. Regiões musculares são as mesmas; só o outline muda.
// ---------------------------------------------------------------------------

/** Path da silhueta humana simplificada — frente feminina (viewBox 0 0 200 340). */
export const BODY_OUTLINE_FRONT_F =
  'M100 10 C82 10 70 22 70 38 C70 52 77 62 86 66 L84 90 C76 92 60 97 55 108 L50 155 L46 218 L52 288 L58 330 L66 330 L70 288 L72 240 L75 200 L100 196 L125 200 L128 240 L130 288 L134 330 L142 330 L148 288 L154 218 L150 155 L145 108 C140 97 124 92 116 90 L114 66 C123 62 130 52 130 38 C130 22 118 10 100 10Z M55 108 L40 113 L35 165 L43 169 L50 130 Z M145 108 L160 113 L165 165 L157 169 L150 130 Z';

/** Path da silhueta humana simplificada — costas feminina (viewBox 0 0 200 340). */
export const BODY_OUTLINE_BACK_F =
  'M100 10 C82 10 70 22 70 38 C70 52 77 62 86 66 L84 90 C76 92 60 97 55 108 L50 155 L46 218 L52 288 L58 330 L66 330 L70 288 L72 240 L75 200 L100 196 L125 200 L128 240 L130 288 L134 330 L142 330 L148 288 L154 218 L150 155 L145 108 C140 97 124 92 116 90 L114 66 C123 62 130 52 130 38 C130 22 118 10 100 10Z M55 108 L40 113 L35 165 L43 169 L50 130 Z M145 108 L160 113 L165 165 L157 169 L150 130 Z';

/**
 * Retorna os paths de outline corretos para a figura selecionada.
 * Uso: `const { front, back } = bodyOutline('female')`.
 */
export function bodyOutline(figure: 'male' | 'female'): {
  front: string;
  back: string;
} {
  if (figure === 'female') {
    return { front: BODY_OUTLINE_FRONT_F, back: BODY_OUTLINE_BACK_F };
  }
  return { front: BODY_OUTLINE_FRONT, back: BODY_OUTLINE_BACK };
}

// ---------------------------------------------------------------------------
// Regiões musculares — paths simplificados sobre a silhueta
// ---------------------------------------------------------------------------

export const MUSCLE_REGIONS: Partial<Record<MuscleGroup, MuscleRegion>> = {
  // ---- PEITO ----
  chest: {
    front: [
      // peitoral esquerdo (do ponto de vista de quem olha)
      'M86 90 C80 90 73 95 71 105 C69 115 72 122 80 124 C88 126 96 122 98 112 L100 95 Z',
      // peitoral direito
      'M114 90 C120 90 127 95 129 105 C131 115 128 122 120 124 C112 126 104 122 102 112 L100 95 Z',
    ],
  },

  // ---- OMBROS ----
  shoulders: {
    front: [
      // deltoide anterior esquerdo
      'M68 88 C61 88 54 94 52 102 L60 108 C65 100 72 96 78 94 Z',
      // deltoide anterior direito
      'M132 88 C139 88 146 94 148 102 L140 108 C135 100 128 96 122 94 Z',
    ],
    back: [
      // deltoide posterior esquerdo
      'M68 88 C61 88 54 94 52 102 L60 108 C65 100 72 96 78 94 Z',
      // deltoide posterior direito
      'M132 88 C139 88 146 94 148 102 L140 108 C135 100 128 96 122 94 Z',
    ],
  },

  // ---- TRÍCEPS ---- (vista frontal lateral + costas)
  triceps: {
    front: [
      // tríceps esquerdo (lateral externo visível de frente)
      'M46 112 C40 115 36 130 36 148 L44 148 C44 132 46 118 50 113 Z',
      // tríceps direito
      'M154 112 C160 115 164 130 164 148 L156 148 C156 132 154 118 150 113 Z',
    ],
    back: [
      // tríceps esquerdo costas
      'M44 112 C38 116 34 132 35 152 L43 150 C42 134 44 120 48 114 Z',
      // tríceps direito costas
      'M156 112 C162 116 166 132 165 152 L157 150 C158 134 156 120 152 114 Z',
    ],
  },

  // ---- BÍCEPS ---- (frontal)
  biceps: {
    front: [
      // bíceps esquerdo
      'M44 148 C38 155 36 168 40 175 L48 172 C45 165 46 155 50 150 Z',
      // bíceps direito
      'M156 148 C162 155 164 168 160 175 L152 172 C155 165 154 155 150 150 Z',
    ],
  },

  // ---- ANTEBRAÇOS ----
  forearms: {
    front: [
      'M40 175 C36 182 34 198 36 210 L44 208 C42 196 42 183 46 177 Z',
      'M160 175 C164 182 166 198 164 210 L156 208 C158 196 158 183 154 177 Z',
    ],
  },

  // ---- ABDÔMEN ----
  abs: {
    front: [
      // bloco superior
      'M88 126 L88 148 C92 150 108 150 112 148 L112 126 C108 128 92 128 88 126 Z',
      // bloco médio
      'M88 150 L88 168 C92 170 108 170 112 168 L112 150 C108 152 92 152 88 150 Z',
      // bloco inferior
      'M89 170 L90 188 C94 190 106 190 110 188 L111 170 C107 172 93 172 89 170 Z',
    ],
  },

  // ---- OBLÍQUOS ----
  obliques: {
    front: [
      'M73 128 C68 132 65 148 66 168 L74 165 C74 148 76 134 80 128 Z',
      'M127 128 C132 132 135 148 134 168 L126 165 C126 148 124 134 120 128 Z',
    ],
  },

  // ---- QUADRÍCEPS ----
  quads: {
    front: [
      // quádriceps esquerdo
      'M73 198 C68 210 66 240 68 268 L80 268 C80 240 80 212 82 200 Z',
      // quádriceps direito
      'M127 198 C132 210 134 240 132 268 L120 268 C120 240 120 212 118 200 Z',
    ],
  },

  // ---- POSTERIOR (isquiossurais) ----
  hamstrings: {
    back: [
      // posterior esquerdo
      'M73 198 C68 212 66 244 68 270 L80 270 C80 244 80 214 82 200 Z',
      // posterior direito
      'M127 198 C132 212 134 244 132 270 L120 270 C120 244 120 214 118 200 Z',
    ],
  },

  // ---- GLÚTEOS ----
  glutes: {
    back: [
      // glúteo esquerdo
      'M74 180 C65 186 62 196 66 206 C70 216 82 218 90 212 C98 206 100 196 96 186 Z',
      // glúteo direito
      'M126 180 C135 186 138 196 134 206 C130 216 118 218 110 212 C102 206 100 196 104 186 Z',
    ],
  },

  // ---- PANTURRILHA ----
  calves: {
    front: [
      'M68 270 C67 282 68 302 70 318 L80 318 C79 302 79 282 80 270 Z',
      'M132 270 C133 282 132 302 130 318 L120 318 C121 302 121 282 120 270 Z',
    ],
    back: [
      'M68 270 C67 282 68 302 70 318 L80 318 C79 302 79 282 80 270 Z',
      'M132 270 C133 282 132 302 130 318 L120 318 C121 302 121 282 120 270 Z',
    ],
  },

  // ---- COSTAS (latíssimo + região geral) ---- usamos "back" como grupo guarda-chuva
  back: {
    back: [
      // latíssimo esquerdo
      'M70 100 C60 110 56 136 60 158 L72 154 C70 134 72 110 78 102 Z',
      // latíssimo direito
      'M130 100 C140 110 144 136 140 158 L128 154 C130 134 128 110 122 102 Z',
      // meio das costas
      'M78 110 L78 170 C86 174 114 174 122 170 L122 110 C114 114 86 114 78 110 Z',
    ],
  },

  // ---- LATÍSSIMO (específico — se quiserem) ----
  lats: {
    back: [
      'M70 100 C60 110 56 136 60 158 L72 154 C70 134 72 110 78 102 Z',
      'M130 100 C140 110 144 136 140 158 L128 154 C130 134 128 110 122 102 Z',
    ],
  },

  // ---- TRAPÉZIO ----
  traps: {
    back: [
      // trapézio esquerdo
      'M85 68 C76 72 70 80 68 90 C74 90 84 92 90 94 L94 76 Z',
      // trapézio direito
      'M115 68 C124 72 130 80 132 90 C126 90 116 92 110 94 L106 76 Z',
      // trapézio central (meio do pescoço/base)
      'M90 68 L90 82 C94 84 106 84 110 82 L110 68 Z',
    ],
  },
};
