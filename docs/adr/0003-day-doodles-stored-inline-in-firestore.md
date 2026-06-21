# ADR 0003: Day Doodles are stored inline in a per-user Firestore document

**Status:** Accepted

## Context

The Planner gained drawable date cards: each calendar date can hold a **Day Doodle**, a small
(120×90) personal drawing. A Day Doodle reuses the existing **Stroke** model and drawing surface,
so the obvious default would be to store its strokes the same way a **Canvas** does.

ADR 0001 splits Canvas storage by access pattern: live, high-frequency stroke data goes to the
Realtime Database (RTDB) — one RTDB key per stroke — and only metadata lives in Firestore. That
split exists because Canvases are **collaborative**: many Members draw at once, cursors sync at
~20 events/sec/user, and Firestore's per-operation pricing would be ruinous for that traffic.

A Day Doodle is different in kind:

- **Personal and non-collaborative** — exactly one author, no Members, no Presence, no live cursor
  sync. There is no second writer to stream to.
- **Small and bounded** — a 120×90 frame holds short paths; a whole doodle is a handful of KB.
- **Read in bulk** — the month grid needs every visible day's drawing at once to paint thumbnails.

## Decision

Store each Day Doodle as a **single Firestore document** at `users/{uid}/dayDoodles/{isoDate}`,
with all of its strokes **inline** in a `strokes` array. No RTDB, no metadata/stroke split.

- The ISO date (`yyyy-mm-dd`) is the document id, so a specific day is addressed without a query,
  and the whole month is one range query (`date >= start && date <= end`).
- Ownership is **pinned by the path**: the Security Rule allows read/write only when
  `request.auth.uid == uid`, so a user cannot even address another user's doodles. No ownership
  field to validate.
- Saves are **debounced** (~800 ms after the last stroke) and **flushed on modal close**, and a
  size-aware cap (`MAX_DOODLE_POINTS`) guards against Firestore's 1 MiB document limit.

## Consequences

- This is a **deliberate departure from ADR 0001**: strokes for a Day Doodle live in Firestore,
  not RTDB. The justification is access pattern, not consistency — Day Doodles lack the
  collaborative, high-frequency traffic that made RTDB necessary for Canvases.
- **Whole-document writes**: every save rewrites the entire `strokes` array, and there is no
  per-stroke merge. The reachable failure is **last-write-wins across two tabs/devices** drawing
  the same day — the second flush clobbers the first. Accepted as a known limitation for a tiny
  personal drawing; if it bites, the fix is a `strokes` subcollection (per-stroke docs), at the
  cost of more reads on load.
- Inline vector strokes (not a flat PNG snapshot) are **required** anyway, because the calendar
  thumbnails animate the wiggle/boil — they need the stroke geometry, not a static image.
- Reads scale with the visible range: one query per month returns up to ~42 small documents.
