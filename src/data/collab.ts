import { ref, onValue, off, set, remove, onDisconnect, serverTimestamp } from 'firebase/database'
import { rtdb } from '../lib/firebase'

// Shared primitive for the ephemeral collaboration channels (cursors, live strokes, text focus,
// presence). Each lives at `canvases/{canvasId}/{channel}/{uid}` — a per-user node under a shared
// channel node. This is the only module that touches `firebase/database` for those channels; the
// hooks on top keep their own throttle/emit timing and supply a per-entry mapper (which validates
// and/or excludes self), so moving the I/O here changes no behavior.

function channelNode(canvasId: string, channel: string) {
  return ref(rtdb, `canvases/${canvasId}/${channel}`)
}

function ownNode(canvasId: string, channel: string, uid: string) {
  return ref(rtdb, `canvases/${canvasId}/${channel}/${uid}`)
}

// Subscribe to every peer on a channel. `mapEntry` turns one raw child value into the channel's
// type (or null to drop it — e.g. self, or a record that fails validation). Returns unsubscribe.
export function subscribeChannel<T>(
  canvasId: string,
  channel: string,
  mapEntry: (uid: string, raw: unknown) => T | null,
  onEntries: (entries: Record<string, T>) => void,
): () => void {
  const node = channelNode(canvasId, channel)
  const handle = onValue(node, (snap) => {
    const data: Record<string, T> = {}
    snap.forEach((child) => {
      const mapped = mapEntry(child.key!, child.val())
      if (mapped !== null) data[child.key!] = mapped
    })
    onEntries(data)
  })
  return () => off(node, 'value', handle)
}

// Write this user's value on a channel.
export function publishOwn(canvasId: string, channel: string, uid: string, value: object): void {
  set(ownNode(canvasId, channel, uid), value)
}

// Remove this user's value from a channel.
export function clearOwn(canvasId: string, channel: string, uid: string): void {
  remove(ownNode(canvasId, channel, uid))
}

// Schedule removal of this user's value if the client disconnects unexpectedly.
export function clearOwnOnDisconnect(canvasId: string, channel: string, uid: string): void {
  onDisconnect(ownNode(canvasId, channel, uid)).remove()
}

// RTDB write-time sentinel resolved to a number on the server (used by presence's joinedAt).
export { serverTimestamp as channelServerTimestamp }
