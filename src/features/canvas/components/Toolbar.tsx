import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../lib/icons';
import type { ToolType } from '../../../lib/types';
import { STROKE_SIZES } from '../utils/strokeSize';
import {
  STICKER_IDS,
  STICKER_LABELS,
  drawSticker,
} from '../render/stickerLibrary';

interface Props {
  tool: ToolType;
  color: string;
  strokeWidth: number;
  selectedSticker: string;
  onToolChange: (t: ToolType) => void;
  onColorChange: (c: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onStickerChange: (id: string) => void;
  onClear: () => void;
  horizontal?: boolean;
}

const DRAW_TOOLS: { id: ToolType; icon: string; label: string }[] = [
  { id: 'pen', icon: 'pen', label: 'Pen' },
  { id: 'marker', icon: 'marker', label: 'Marker' },
  { id: 'line', icon: 'line', label: 'Line' },
  { id: 'rect', icon: 'square', label: 'Rectangle' },
  { id: 'circle', icon: 'circle', label: 'Circle' },
  { id: 'text', icon: 'text', label: 'Text' },
  { id: 'sticker', icon: 'sticker', label: 'Sticker' },
];

const PALETTE = [
  '#14151c',
  '#3d5afe',
  '#12c2e9',
  '#15cf7f',
  '#ffb01f',
  '#ff5d73',
  '#ff62b0',
  '#9b5de5',
  '#ffffff',
];
const SIZES = STROKE_SIZES;

// Small canvas thumbnail for a single sticker
function StickerThumb({
  id,
  selected,
  onClick,
}: {
  id: string;
  selected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = 36 * dpr;
    el.height = 36 * dpr;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(18, 18);
    drawSticker(ctx, id, 14, '#333333');
    ctx.restore();
  }, [id]);

  return (
    <button
      title={STICKER_LABELS[id]}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: selected ? 'var(--m-bg-2)' : 'transparent',
        boxShadow: selected ? 'inset 0 0 0 2px var(--m-accent)' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        width={36}
        height={36}
        style={{ display: 'block', width: 36, height: 36 }}
      />
    </button>
  );
}

export function Toolbar({
  tool,
  color,
  strokeWidth,
  selectedSticker,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onStickerChange,
  onClear,
  horizontal = false,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [showStickers, setShowStickers] = useState(false);

  // Open the sticker panel automatically when the sticker tool is activated
  useEffect(() => {
    if (tool === 'sticker') setShowStickers(true);
    else setShowStickers(false);
  }, [tool]);

  const colorSwatch = (
    <button
      className='m-tool'
      title='Color & size'
      onClick={() => {
        setShowPicker((v) => !v);
        setShowStickers(false);
      }}
      style={{ position: 'relative', flexShrink: 0 }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          background: color,
          flexShrink: 0,
          display: 'block',
          boxShadow:
            color === '#ffffff' ? 'inset 0 0 0 1.5px var(--m-line-2)' : 'none',
        }}
      />
    </button>
  );

  const picker = showPicker && (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9 }}
        onClick={() => setShowPicker(false)}
      />
      <div
        className='m-card'
        style={{
          position: 'absolute',
          ...(horizontal
            ? { bottom: 'calc(100% + 8px)', left: 0 }
            : { left: 'calc(100% + 12px)', top: 0 }),
          padding: 12,
          zIndex: 20,
          borderRadius: 16,
          boxShadow: 'var(--m-shadow-lg)',
          minWidth: 158,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 9,
          }}
        >
          {PALETTE.map((c) => (
            <button
              key={c}
              className='m-swatch'
              onClick={() => {
                onColorChange(c);
                if (tool === 'eraser') onToolChange('pen');
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: c,
                border: 'none',
                cursor: 'pointer',
                boxShadow:
                  c === color
                    ? '0 0 0 2.5px var(--m-ink)'
                    : c === '#ffffff'
                      ? 'inset 0 0 0 1.5px var(--m-line-2)'
                      : 'none',
              }}
            />
          ))}
        </div>
        <div
          style={{ height: 1, background: 'var(--m-line)', margin: '11px 0' }}
        />
        <div className='m-row' style={{ justifyContent: 'space-between' }}>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => onStrokeWidthChange(s)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: strokeWidth === s ? 'var(--m-bg-2)' : 'transparent',
                boxShadow:
                  strokeWidth === s
                    ? 'inset 0 0 0 1.5px var(--m-line-2)'
                    : 'none',
              }}
            >
              <span
                style={{
                  width: Math.min(s + 4, 22),
                  height: Math.min(s + 4, 22),
                  borderRadius: '50%',
                  background: 'var(--m-ink)',
                  display: 'block',
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const stickerPanel = showStickers && (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9 }}
        onClick={() => setShowStickers(false)}
      />
      <div
        className='m-card'
        style={{
          position: 'absolute',
          ...(horizontal
            ? { bottom: 'calc(100% + 8px)', left: 0 }
            : { left: 'calc(100% + 12px)', top: 0 }),
          padding: 10,
          zIndex: 20,
          borderRadius: 16,
          boxShadow: 'var(--m-shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 4,
          }}
        >
          {STICKER_IDS.map((id) => (
            <StickerThumb
              key={id}
              id={id}
              selected={selectedSticker === id}
              onClick={() => {
                onStickerChange(id);
                onToolChange('sticker');
              }}
            />
          ))}
        </div>
      </div>
    </>
  );

  /* ── Horizontal bottom bar (mobile) ── */
  if (horizontal) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '0 12px',
          height: 60,
          flexShrink: 0,
          borderTop: '1px solid var(--m-line)',
          background: 'var(--m-surface)',
          overflowX: 'auto',
          overflowY: 'visible',
          zIndex: 5,
        }}
      >
        {/* Color swatch + picker */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {colorSwatch}
          {picker}
        </div>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 28,
            background: 'var(--m-line)',
            flexShrink: 0,
            margin: '0 4px',
          }}
        />

        {/* Draw tools */}
        {DRAW_TOOLS.map(({ id, icon, label }) => (
          <div key={id} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              title={label}
              onClick={() => {
                onToolChange(tool === id ? 'select' : id);
                setShowPicker(false);
              }}
              className={'m-tool ' + (tool === id ? 'm-tool-on' : '')}
              style={{ flexShrink: 0, width: 40, height: 40 }}
            >
              <Icon name={icon} size={19} />
            </button>
            {id === 'sticker' && stickerPanel}
          </div>
        ))}

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 28,
            background: 'var(--m-line)',
            flexShrink: 0,
            margin: '0 4px',
          }}
        />

        {/* Eraser */}
        <button
          title='Eraser'
          onClick={() => {
            onToolChange(tool === 'eraser' ? 'select' : 'eraser');
            setShowPicker(false);
          }}
          className={'m-tool ' + (tool === 'eraser' ? 'm-tool-on' : '')}
          style={{ flexShrink: 0, width: 40, height: 40 }}
        >
          <Icon name='eraser' size={19} />
        </button>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 28,
            background: 'var(--m-line)',
            flexShrink: 0,
            margin: '0 4px',
          }}
        />

        {/* Clear */}
        <button
          title='Clear canvas'
          onClick={() => {
            onClear();
            setShowPicker(false);
          }}
          className='m-tool'
          style={{
            flexShrink: 0,
            fontFamily: 'var(--ui)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--m-ink-3)',
            width: 40,
            height: 40,
          }}
        >
          Clear
        </button>
      </div>
    );
  }

  /* ── Vertical left rail (desktop) ── */
  return (
    <div
      className='m-col m-center'
      style={{
        width: 64,
        flex: '0 0 64px',
        height: '100%',
        borderRight: '1px solid var(--m-line)',
        background: 'var(--m-surface)',
        padding: '12px 0',
        gap: 4,
        zIndex: 5,
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Hand / pan tool */}
      <button
        title='Hand (Space)'
        onClick={() => {
          onToolChange(tool === 'hand' ? 'select' : 'hand');
          setShowPicker(false);
        }}
        className={'m-tool ' + (tool === 'hand' ? 'm-tool-on' : '')}
      >
        <Icon name='hand' size={20} />
      </button>

      <div
        style={{
          width: 30,
          height: 1,
          background: 'var(--m-line)',
          margin: '2px 0',
          flexShrink: 0,
        }}
      />

      {DRAW_TOOLS.map(({ id, icon, label }) => (
        <div key={id} style={{ position: 'relative' }}>
          <button
            title={label}
            onClick={() => {
              onToolChange(tool === id ? 'select' : id);
              setShowPicker(false);
            }}
            className={'m-tool ' + (tool === id ? 'm-tool-on' : '')}
          >
            <Icon name={icon} size={20} />
          </button>
          {id === 'sticker' && stickerPanel}
        </div>
      ))}

      <div
        style={{
          width: 30,
          height: 1,
          background: 'var(--m-line)',
          margin: '6px 0',
          flexShrink: 0,
        }}
      />

      <div style={{ position: 'relative' }}>
        {colorSwatch}
        {picker}
      </div>

      <button
        title='Eraser'
        onClick={() => {
          onToolChange(tool === 'eraser' ? 'select' : 'eraser');
          setShowPicker(false);
        }}
        className={'m-tool ' + (tool === 'eraser' ? 'm-tool-on' : '')}
      >
        <Icon name='eraser' size={20} />
      </button>

      <div style={{ flex: 1 }} />

      <button
        title='Clear canvas'
        onClick={() => {
          onClear();
          setShowPicker(false);
        }}
        className='m-tool'
        style={{
          fontFamily: 'var(--ui)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--m-ink-3)',
        }}
      >
        Clear
      </button>
    </div>
  );
}
