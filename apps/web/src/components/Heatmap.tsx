// Heatmap de atividade estilo GitHub — grade de ~17 semanas × 7 dias.
// Cada célula representa um dia; a intensidade (opacidade do --flame) reflete
// quantos treinos foram feitos naquele dia.

import { useMemo } from 'react';
import { toISO, fromISO, addDays } from '@forja/core';
import { useT } from '../lib/i18n';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CELL = 14;        // tamanho da célula (px)
const GAP = 3;          // espaçamento entre células (px)
const WEEKS = 17;       // número de semanas exibidas
const MONTH_LABELS_Y = 14; // y dos labels de mês
const GRID_TOP = 22;    // início da grade (abaixo dos labels de mês)

const DAY_LABEL_X = 16; // x dos labels de dia da semana

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cor de fundo da célula baseada na intensidade (0 = sem treino). */
function cellColor(count: number): string {
  if (count === 0) return 'var(--surface-2)';
  if (count === 1) return 'color-mix(in srgb, var(--accent) 45%, var(--surface-2))';
  if (count === 2) return 'color-mix(in srgb, var(--accent) 70%, var(--surface-2))';
  return 'var(--flame)';
}

/** Label do mês abreviado de acordo com o locale do browser. */
function monthAbbr(monthIndex: number, lang: string): string {
  const date = new Date(2024, monthIndex, 1);
  return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { month: 'short' }).replace('.', '');
}

// ---------------------------------------------------------------------------
// Props e componente
// ---------------------------------------------------------------------------

interface HeatmapProps {
  /** Lista de datas ISO (YYYY-MM-DD) dos treinos. Pode ter duplicatas (>1 treino/dia). */
  dates: string[];
}

export function Heatmap({ dates }: HeatmapProps) {
  const tFn = useT();
  // Lê o idioma atual para a função de mês e abreviaturas de dia
  const langRaw = (tFn('wd.short.0') === 'Sun') ? 'en' : 'pt';

  // Abreviaturas de dia da semana no idioma atual (dom..sáb)
  const DAY_ABBR = [0, 1, 2, 3, 4, 5, 6].map((i) => tFn(`wd.short.${i}`).charAt(0));

  // ---- construir a grade ----
  const { cells, monthMarkers } = useMemo(() => {
    // Conta treinos por dia
    const countByDate = new Map<string, number>();
    for (const d of dates) {
      countByDate.set(d, (countByDate.get(d) ?? 0) + 1);
    }

    // Dia inicial: começa num domingo, TOTAL_DAYS antes de hoje
    const today = toISO(new Date());
    // Recua até o domingo anterior a (hoje - TOTAL_DAYS)
    const startDate = (() => {
      const weekday = fromISO(today).getDay();
      return addDays(today, -weekday - (WEEKS - 1) * 7);
    })();

    // Gera todas as células (cada uma tem col, row, iso, count)
    type Cell = { col: number; row: number; iso: string; count: number };
    const cells: Cell[] = [];
    // Meses únicos para labels
    type MonthMarker = { col: number; label: string };
    const monthMarkers: MonthMarker[] = [];
    let lastMonth = -1;

    for (let i = 0; i < WEEKS * 7; i++) {
      const iso = addDays(startDate, i);
      if (iso > today) break; // não exibir datas futuras

      const col = Math.floor(i / 7);
      const row = i % 7; // 0=dom
      const count = countByDate.get(iso) ?? 0;
      cells.push({ col, row, iso, count });

      // Label de mês: primeira célula de cada novo mês
      const month = fromISO(iso).getMonth();
      if (month !== lastMonth) {
        monthMarkers.push({ col, label: monthAbbr(month, langRaw) });
        lastMonth = month;
      }
    }

    return { cells, monthMarkers };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, langRaw]);

  // ---- dimensões do SVG ----
  const svgW = WEEKS * (CELL + GAP) + 24; // 24 = espaço pra labels de dia
  const svgH = GRID_TOP + 7 * (CELL + GAP);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      aria-label={tFn('heatmap.ariaLabel')}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Labels de mês */}
      {monthMarkers.map(({ col, label }) => (
        <text
          key={`month-${col}`}
          x={24 + col * (CELL + GAP)}
          y={MONTH_LABELS_Y}
          fontSize={9}
          fill="var(--text-muted)"
          fontFamily="var(--font-body)"
          letterSpacing="0.04em"
        >
          {label}
        </text>
      ))}

      {/* Labels de dia da semana (dom, seg, ter...) — apenas 3 deles pra não poluir */}
      {[0, 2, 4].map((row) => (
        <text
          key={`wd-${row}`}
          x={DAY_LABEL_X}
          y={GRID_TOP + row * (CELL + GAP) + CELL - 2}
          fontSize={8}
          fill="var(--text-muted)"
          fontFamily="var(--font-body)"
          textAnchor="end"
        >
          {DAY_ABBR[row] ?? ''}
        </text>
      ))}

      {/* Células */}
      {cells.map(({ col, row, iso, count }) => (
        <rect
          key={iso}
          x={24 + col * (CELL + GAP)}
          y={GRID_TOP + row * (CELL + GAP)}
          width={CELL}
          height={CELL}
          rx={3}
          ry={3}
          fill={cellColor(count)}
          style={{ transition: 'fill 0.15s ease' }}
        >
          <title>{count > 0
            ? tFn('heatmap.tooltip', [iso, count, count > 1 ? 's' : ''])
            : iso
          }</title>
        </rect>
      ))}
    </svg>
  );
}
