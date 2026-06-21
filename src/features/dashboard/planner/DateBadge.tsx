// The date number overlaid on a Day Doodle frame. It is non-drawable chrome, not part of the
// drawing. Sized in `cqw` (container-query width) and positioned in %, so it renders at the *same*
// relative size and place whether the frame is a tiny calendar card or the enlarged modal preview
// — the modal therefore previews exactly how the date will sit over the art on the calendar. The
// nearest ancestor must set `containerType: 'inline-size'`.
export function DateBadge({ day, color }: { day: number; color?: string }) {
  return (
    <span
      className="m-bold"
      style={{
        position: 'absolute',
        top: '6%',
        left: '8%',
        zIndex: 1,
        pointerEvents: 'none',
        fontSize: '11cqw',
        lineHeight: 1,
        fontFamily: 'var(--ui)',
        color: color ?? 'inherit',
      }}
    >
      {day}
    </span>
  )
}
