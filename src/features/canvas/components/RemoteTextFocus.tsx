import { Group, Rect, Label, Tag, Text } from 'react-konva'
import type { Stroke, TextFocus } from '../../../lib/types'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'

interface Props {
  focuses: { uid: string; focus: TextFocus }[]
  strokes: Stroke[]
  displayNames: Record<string, string>
  zoom: number
}

// Draws, for each friend focused on a Text Box, a coloured outline around that box plus a
// name tag — dashed while they have it merely selected, solid + thicker while they're editing.
// Rendered inside the Konva layer so it pans/zooms/rotates with the box automatically. Sizes
// are divided by zoom so the outline weight and label stay a constant thickness on screen.
export function RemoteTextFocus({ focuses, strokes, displayNames, zoom }: Props) {
  return (
    <>
      {focuses.map(({ uid, focus }) => {
        const s = strokes.find((st) => st.id === focus.boxId && st.type === 'text')
        if (!s) return null
        const d = s.data
        const w = d.width ?? MIN_TEXT_WIDTH
        const h = d.height ?? MIN_TEXT_HEIGHT
        const x = d.x ?? 0
        const y = d.y ?? 0
        const rot = d.rotation ?? 0
        const name = displayNames[uid] ?? uid.slice(0, 6)
        return (
          <Group
            key={uid}
            x={x + w / 2}
            y={y + h / 2}
            offsetX={w / 2}
            offsetY={h / 2}
            rotation={rot}
            listening={false}
          >
            <Rect
              width={w}
              height={h}
              stroke={focus.color}
              strokeWidth={(focus.editing ? 2.5 : 2) / zoom}
              dash={focus.editing ? undefined : [7 / zoom, 4 / zoom]}
              cornerRadius={4 / zoom}
            />
            <Label y={-22 / zoom}>
              <Tag fill={focus.color} cornerRadius={3 / zoom} />
              <Text
                text={name}
                fontSize={12 / zoom}
                fontFamily="Quicksand, system-ui, sans-serif"
                fill="#fff"
                padding={3 / zoom}
              />
            </Label>
          </Group>
        )
      })}
    </>
  )
}
