// Componente de demo visual de exercício.
//
// Renderiza a mídia correta de acordo com DemoSource.kind:
//   'cdn'    → <img> com imagem estática; troca para GIF ao expandir/tocar.
//   'custom' → SVG desenhado à mão injetado (SMIL/flipbook).
//   'asset'  → placeholder (SVG local ainda não implementado nesta fase).
//   'none'   → placeholder com ícone Dumbbell.
//
// Fallback offline: se o GIF CDN falhar, volta à imagem estática; se a imagem
// também falhar, mostra o placeholder silenciosamente (nunca quebra o layout).

import { useState, useCallback } from 'react';
import { Dumbbell } from 'lucide-react';
import type { DemoSource } from '@forja/core';
import { useT } from '../lib/i18n';
import './Media.css';

export type MediaSize = 'sm' | 'md' | 'lg' | 'xl';

export interface MediaProps {
  demo: DemoSource;
  /** Nome do exercício (usado como alt text). */
  name: string;
  /** Tamanho do quadrado de mídia (padrão: 'md'). */
  size?: MediaSize;
  /** Quando true, sempre mostra imagem estática (jamais GIF). Usado em Settings "sem imagens". */
  staticOnly?: boolean;
  className?: string;
}

/**
 * Componente de demo visual de exercício.
 * Lazy-load: imagem estática (poster) é carregada com loading="lazy";
 * o GIF só é requisitado ao tocar/expandir o componente.
 */
export function Media({ demo, name, size = 'md', staticOnly = false, className }: MediaProps) {
  const t = useT();
  // Estado para controle do GIF (só carrega ao tocar)
  const [gifAtivo, setGifAtivo] = useState(false);
  // Fallback: se gif falhar, mostrar imagem; se imagem falhar, mostrar placeholder
  const [gifErro, setGifErro] = useState(false);
  const [imagemErro, setImagemErro] = useState(false);

  const handleToggleGif = useCallback(() => {
    if (!staticOnly) setGifAtivo((v) => !v);
  }, [staticOnly]);

  const handleGifErro = useCallback(() => {
    setGifErro(true);
  }, []);

  const handleImagemErro = useCallback(() => {
    setImagemErro(true);
  }, []);

  // ── kind: 'cdn' ──────────────────────────────────────────────────────────
  if (demo.kind === 'cdn') {
    const temGif = Boolean(demo.gif) && !staticOnly;
    const temImagem = Boolean(demo.image);

    // Determina qual src usar
    let src: string | undefined;
    if (temGif && gifAtivo && !gifErro) {
      src = demo.gif;
    } else if (temImagem && !imagemErro) {
      src = demo.image;
    }

    const media = src ? (
      <img src={src} alt={name} className="media-img" loading="lazy"
        onError={gifAtivo && !gifErro ? handleGifErro : handleImagemErro} />
    ) : <Placeholder />;

    return (
      <div
        className={['media-root', className].filter(Boolean).join(' ')}
        data-size={size}
      >
        {temGif ? (
          <button type="button" className="media-play" onClick={handleToggleGif} aria-pressed={gifAtivo}
            aria-label={t(gifAtivo ? 'media.stopDemo' : 'media.viewDemo', [name])}>
            {media}
          </button>
        ) : media}
        <a href="https://gymvisual.com/" className="media-attribution" target="_blank" rel="noreferrer">© Gym visual</a>
      </div>
    );
  }

  // ── kind: 'custom' (SVG SMIL) ─────────────────────────────────────────────
  if (demo.kind === 'custom') {
    return (
      <div
        className={['media-root', className].filter(Boolean).join(' ')}
        data-size={size}
      >
        <img src={`data:image/svg+xml,${encodeURIComponent(demo.svg)}`} alt={name} className="media-img" loading="lazy" />
      </div>
    );
  }

  // ── kind: 'asset' | 'none' → placeholder ─────────────────────────────────
  return (
    <div
      className={['media-root', className].filter(Boolean).join(' ')}
      data-size={size}
      aria-label={name}
    >
      <Placeholder />
    </div>
  );
}

// Ícone de placeholder interno
function Placeholder() {
  return (
    <div className="media-placeholder" aria-hidden="true">
      <Dumbbell />
    </div>
  );
}
