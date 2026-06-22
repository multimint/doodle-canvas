import { useEffect, useState } from 'react';
import { Icon } from '../../../lib/icons';
import type { ToolType } from '../../../lib/types';
import type { ToolDescriptor } from '../tools/registry';
import { toolbarTools } from '../tools/registry';
import { ColorSizePopover } from './toolbar/ColorSizePopover';
import { StickerPopover } from './toolbar/StickerPopover';

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
  // Show the Hand/pan tool. On by default (the main canvas wants drag-to-pan on touch); the
  // Day Doodle modal sets this false because its locked, fit-to-frame view forbids panning.
  showHand?: boolean;
  // Override the draw-tools row (e.g. the Day Doodle modal drops the shape tools). Defaults to
  // the full registry row.
  drawTools?: ToolDescriptor[];
  // Horizontal bars normally scroll on overflow-x, but `overflow-x: auto` forces overflow-y to
  // `auto` too, which clips the colour/sticker popovers that pop *upward*. Inside the constrained
  // Day Doodle modal we set this so the bar never scrolls and the popovers can escape.
  noScroll?: boolean;
}

// The main draw-tools row, sourced from the tool registry (tools/tools.ts) so adding a tool to
// the table surfaces it here automatically — no parallel list to keep in sync.
const DRAW_TOOLS = toolbarTools();

const divider = (vertical: boolean) =>
  vertical ? (
    <div style={{ width: 30, height: 1, background: 'var(--m-line)', margin: '6px 0', flexShrink: 0 }} />
  ) : (
    <div style={{ width: 1, height: 28, background: 'var(--m-line)', flexShrink: 0, margin: '0 4px' }} />
  );

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
  showHand = true,
  drawTools = DRAW_TOOLS,
  noScroll = false,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [showStickers, setShowStickers] = useState(false);

  // Open the sticker panel automatically when the sticker tool is activated
  useEffect(() => {
    setShowStickers(tool === 'sticker');
  }, [tool]);

  // Activate a tool (or toggle back to select), closing the colour picker.
  const pickTool = (id: ToolType) => {
    onToolChange(tool === id ? 'select' : id);
    setShowPicker(false);
  };

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
          boxShadow: color === '#ffffff' ? 'inset 0 0 0 1.5px var(--m-line-2)' : 'none',
        }}
      />
    </button>
  );

  const picker = showPicker && (
    <ColorSizePopover
      horizontal={horizontal}
      color={color}
      strokeWidth={strokeWidth}
      tool={tool}
      onColorChange={onColorChange}
      onStrokeWidthChange={onStrokeWidthChange}
      onToolChange={onToolChange}
      onClose={() => setShowPicker(false)}
    />
  );

  const stickerPanel = showStickers && (
    <StickerPopover
      horizontal={horizontal}
      selectedSticker={selectedSticker}
      onStickerChange={onStickerChange}
      onToolChange={onToolChange}
      onClose={() => setShowStickers(false)}
    />
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
          // `overflow-x: auto` would force overflow-y to auto and clip the upward popovers, so the
          // modal opts out of scrolling entirely (its trimmed toolset fits without it).
          overflowX: noScroll ? 'visible' : 'auto',
          overflowY: 'visible',
          zIndex: 5,
        }}
      >
        {/* Color swatch + picker */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {colorSwatch}
          {picker}
        </div>

        {divider(false)}

        {/* Hand / pan tool — lets touch users drag to pan with one finger. */}
        {showHand && (
          <button
            title='Hand'
            onClick={() => pickTool('hand')}
            className={'m-tool ' + (tool === 'hand' ? 'm-tool-on' : '')}
            style={{ flexShrink: 0, width: 40, height: 40 }}
          >
            <Icon name='hand' size={19} />
          </button>
        )}

        {/* Draw tools */}
        {drawTools.map(({ id, icon, label }) => (
          <div key={id} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              title={label}
              onClick={() => pickTool(id)}
              className={'m-tool ' + (tool === id ? 'm-tool-on' : '')}
              style={{ flexShrink: 0, width: 40, height: 40 }}
            >
              <Icon name={icon} size={19} />
            </button>
            {id === 'sticker' && stickerPanel}
          </div>
        ))}

        {divider(false)}

        {/* Eraser */}
        <button
          title='Eraser'
          onClick={() => pickTool('eraser')}
          className={'m-tool ' + (tool === 'eraser' ? 'm-tool-on' : '')}
          style={{ flexShrink: 0, width: 40, height: 40 }}
        >
          <Icon name='eraser' size={19} />
        </button>

        {divider(false)}

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
      {showHand && (
        <>
          <button
            title='Hand (Space)'
            onClick={() => pickTool('hand')}
            className={'m-tool ' + (tool === 'hand' ? 'm-tool-on' : '')}
          >
            <Icon name='hand' size={20} />
          </button>
          {divider(true)}
        </>
      )}

      {drawTools.map(({ id, icon, label }) => (
        <div key={id} style={{ position: 'relative' }}>
          <button
            title={label}
            onClick={() => pickTool(id)}
            className={'m-tool ' + (tool === id ? 'm-tool-on' : '')}
          >
            <Icon name={icon} size={20} />
          </button>
          {id === 'sticker' && stickerPanel}
        </div>
      ))}

      {divider(true)}

      <div style={{ position: 'relative' }}>
        {colorSwatch}
        {picker}
      </div>

      <button
        title='Eraser'
        onClick={() => pickTool('eraser')}
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
