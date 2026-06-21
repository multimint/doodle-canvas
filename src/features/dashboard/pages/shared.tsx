import type { User } from 'firebase/auth'
import type { CanvasDoc } from '../../../lib/types'
import { Icon } from '../../../lib/icons'

// Props shared by every data-driven dashboard page. Lists already exclude the
// canvas being created; each page derives its own filtered/sorted view.
export interface PageProps {
  user: User
  uid: string
  owned: CanvasDoc[]
  shared: CanvasDoc[]
  ownedSet: Set<string>
  searchQuery: string
  setSearchQuery: (v: string) => void
  mobile: boolean
  onCreate: () => void
}

// Responsive card-grid columns: two-up on mobile, auto-fill otherwise.
export const docCols = (mobile: boolean, min = 220): React.CSSProperties =>
  mobile
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
    : { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 16 }

// Case-insensitive title filter.
export function filterByTitle(list: CanvasDoc[], q: string): CanvasDoc[] {
  const needle = q.toLowerCase().trim()
  return needle ? list.filter((c) => c.title.toLowerCase().includes(needle)) : list
}

export const byRecent = (a: CanvasDoc, b: CanvasDoc) => b.updatedAt - a.updatedAt

// Section header with an optional right-aligned hint.
export function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="m-row m-between" style={{ alignItems: 'flex-end', gap: 12 }}>
      <div className="m-h3">{title}</div>
      {hint && <span className="m-tiny m-faint" style={{ paddingBottom: 4 }}>{hint}</span>}
    </div>
  )
}

// Dashed "New canvas" tile used as the first cell of the Documents grid.
export function NewTile({ onNew, h = 169 }: { onNew: () => void; h?: number | string }) {
  return (
    <div
      className="m-liftable m-newtile"
      onClick={onNew}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNew()}
      style={{
        minHeight: typeof h === 'number' ? h : 160, height: h, borderRadius: 16,
        background: 'var(--m-surface)', color: 'var(--m-primary)', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        border: '1.5px dashed var(--m-line-2)', cursor: 'pointer',
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: 'color-mix(in oklab, var(--m-primary) 12%, var(--m-surface))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="plus" size={22} color="var(--m-primary)" />
      </div>
      <div className="m-bold" style={{ fontSize: 14.5 }}>New canvas</div>
    </div>
  )
}
