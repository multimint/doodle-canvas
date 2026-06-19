import { Icon } from '../../lib/icons'

// Full-screen overlay shown while a new canvas is being created.
export function CreatingOverlay() {
  return (
    <div className='m-creating-overlay'>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className='m-creating-ring' />
        <div className='m-creating-orb'>
          <Icon name='pen' size={30} color='#fff' />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div className='m-bold' style={{ fontSize: 17, color: 'var(--m-ink)' }}>
          Creating canvas…
        </div>
        <div className='m-tiny m-faint'>Just a moment</div>
      </div>
    </div>
  )
}
