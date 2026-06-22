import type { ToolType } from '../../../../lib/types'
import { STICKER_IDS } from '../../render/stickerLibrary'
import { StickerThumb } from './StickerThumb'
import { popoverAnchor } from './popoverStyle'

interface Props {
  horizontal: boolean
  selectedSticker: string
  onStickerChange: (id: string) => void
  onToolChange: (t: ToolType) => void
  onClose: () => void
}

// The sticker grid popover anchored off the sticker tool button.
export function StickerPopover({
  horizontal,
  selectedSticker,
  onStickerChange,
  onToolChange,
  onClose,
}: Props) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div
        className='m-card'
        style={{
          position: 'absolute',
          ...popoverAnchor(horizontal),
          padding: 10,
          zIndex: 20,
          borderRadius: 16,
          boxShadow: 'var(--m-shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {STICKER_IDS.map((id) => (
            <StickerThumb
              key={id}
              id={id}
              selected={selectedSticker === id}
              onClick={() => {
                onStickerChange(id)
                onToolChange('sticker')
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
