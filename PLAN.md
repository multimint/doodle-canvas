Build a co-op drawing web application called "Doodle Canvas" using React + TypeScript + Vite,
react-konva, and Firebase. Deploy on Vercel.

---

## Stack

- React + TypeScript + Vite
- react-konva (Konva.js) for canvas rendering
- Firebase Auth — Google Sign-In only
- Firestore — canvas metadata, user records, email invites
- Firebase Realtime Database (RTDB) — live strokes, cursors, presence
- Firebase Storage — canvas snapshots (PNG)
- React Router for routing
- Vercel for hosting

---

## Core Features

1. **Google Sign-In** — only auth method
2. **Dashboard** — list owned + shared canvases, create new canvas (max 10 per user)
3. **Drawing canvas** — fixed 1920×1080, tools: freehand pen, eraser, rectangle,
   circle, line, text; color picker + stroke width selector
4. **Share canvas** — owner invites collaborators by email; invited user must have
   logged in at least once (stored in /users by email); unknown emails stored as
   pendingInvites and resolved on their first login
5. **Co-op drawing** — all members draw simultaneously; live cursor positions +
   online avatar list shown in real-time
6. **Per-user undo** — Ctrl+Z removes the current user's own last stroke only
   (local undo stack, not persisted); anyone may delete any stroke

---

## Data Model

### Firestore

/users/{uid}
  email, displayName, photoURL, canvasCount

/canvases/{canvasId}
  title, ownerId, members: string[], pendingInvites: string[],
  width: 1920, height: 1080,
  snapshotUrl: string, snapshotStrokeId: string,
  createdAt, updatedAt

### RTDB

/canvases/{canvasId}/strokes/{strokeId}
  type: 'path' | 'rect' | 'circle' | 'line' | 'text' | 'eraser'
  authorId, data (Konva shape props), timestamp

/canvases/{canvasId}/cursors/{uid}
  x, y, color

/canvases/{canvasId}/presence/{uid}
  displayName, photoURL, color
  (set onDisconnect().remove() on connect)

---

## Eraser Model

The eraser does NOT delete existing strokes. It draws an eraser stroke using
Konva's globalCompositeOperation: 'destination-out', which punches a transparent
hole through all pixels beneath it.

Eraser strokes are stored in RTDB exactly like pen strokes:

  type: 'eraser'
  authorId, timestamp
  data: {
    points: [x1, y1, x2, y2, ...],
    strokeWidth: 20,
    globalCompositeOperation: 'destination-out'
  }

Rules:
- All strokes (pen + eraser) must live on the same Konva Layer. Eraser strokes
  only cut out pixels within their own layer — cross-layer erasure does not work.
- Eraser strokes count toward the 100-stroke snapshot trigger and RTDB storage.
- Undo works identically to pen strokes — pop the eraser stroke ID from the local
  undo stack and delete it from RTDB.

---

## Snapshot Strategy

Every 100 strokes (pen + eraser combined), the client that drew the 100th stroke:
1. Calls stage.toDataURL() to get a PNG
2. Uploads it to Firebase Storage at /snapshots/{canvasId}/{timestamp}.png
3. Updates the Firestore canvas document with snapshotUrl and snapshotStrokeId
4. Deletes all RTDB strokes with timestamp <= snapshotStrokeId to free RTDB storage

On canvas load:
1. Fetch snapshotUrl from Firestore and render it as a background image
2. Fetch all RTDB strokes with timestamp > snapshotStrokeId and replay them on top

Risk: if the triggering client closes the tab before upload completes, that snapshot
is skipped — the next 100-stroke boundary retriggers. Acceptable for casual use.

---

## Project Structure

src/
├── features/
│   ├── auth/
│   │   ├── GoogleSignIn.tsx
│   │   └── useAuth.ts
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   ├── CanvasCard.tsx
│   │   └── useCanvasList.ts
│   ├── canvas/
│   │   ├── components/
│   │   │   ├── DrawingStage.tsx      # react-konva Stage + Layer (single layer)
│   │   │   ├── Toolbar.tsx           # tool/color/size picker
│   │   │   ├── CursorOverlay.tsx     # remote cursors
│   │   │   └── PresenceBar.tsx       # online avatar list
│   │   ├── hooks/
│   │   │   ├── useStrokes.ts         # RTDB stroke sync
│   │   │   ├── useCursors.ts         # RTDB cursor broadcast + subscribe
│   │   │   ├── usePresence.ts        # RTDB onDisconnect presence
│   │   │   └── useUndoStack.ts       # local per-user undo
│   │   └── utils/
│   │       ├── strokeSerializer.ts   # Konva props <-> RTDB JSON
│   │       └── snapshot.ts           # toDataURL + Storage upload + RTDB pruning
│   └── sharing/
│       ├── InviteModal.tsx
│       └── usePendingInvites.ts      # resolve pendingInvites on login
├── lib/
│   ├── firebase.ts                   # Firebase app init (all services)
│   └── types.ts                      # Canvas, Stroke, User, Presence types
└── app/
    ├── App.tsx                       # React Router routes
    └── ProtectedRoute.tsx

---

## Risks & Concerns

1. **Spark plan write quota** — Firestore allows 20k writes/day. With active drawing,
   metadata writes (canvas updates, invite operations) can accumulate. Keep all
   high-frequency writes (strokes, cursors) in RTDB, never Firestore.

2. **RTDB 100MB storage cap** — Unsnapshotted strokes accumulate. After each
   successful snapshot upload, delete all RTDB strokes with timestamp <=
   snapshotStrokeId to reclaim space.

3. **Pending invite resolution** — If an invited email has never logged in, their uid
   is unknown. Store email in pendingInvites[]. On every login, query Firestore for
   canvases where pendingInvites contains the user's email, move them to members[],
   and remove from pendingInvites[]. Do this in a Firestore transaction.

4. **Canvas limit enforcement** — Cap at 10 canvases per user. Maintain canvasCount
   on the user document. Enforce in Firestore Security Rules:
   allow create: if get(/users/$(request.auth.uid)).data.canvasCount < 10

5. **RTDB orphan cleanup** — Deleting a canvas in Firestore does not remove its RTDB
   subtree. The client that deletes the canvas must also call remove() on
   /canvases/{canvasId} in RTDB.

6. **Cursor write frequency** — Throttle mousemove to emit cursor updates at most
   every 50ms (20Hz). Without throttling, 20 users generate ~400 RTDB writes/sec
   which approaches RTDB connection limits on Spark.

7. **Undo across deletions** — A collaborator may delete a stroke that is still in the
   current user's undo stack. Handle gracefully: if the stroke ID no longer exists in
   RTDB, pop it silently without showing an error.

8. **Eraser layer constraint** — All strokes (pen + eraser) must be on a single Konva
   Layer. Do not split strokes across layers per user — eraser globalCompositeOperation
   only affects pixels within the same layer.
