# ADR 0004: The Daily Planner is a Canvas kind, and day→document links are per-user

**Status:** Accepted

## Context

The Planner gained the ability to **link documents to a calendar date** and to create a new
**Daily Planner** — a drawing surface pre-printed with the "My Day" template. Two design questions
had non-obvious answers, both of which look surprising next to [ADR 0003](./0003-day-doodles-stored-inline-in-firestore.md).

ADR 0003 argued, deliberately, that a **Day Doodle** is **not** a Canvas: it is personal,
non-collaborative, stored inline in one Firestore document under the owner, and never opened as a
full canvas document. A Daily Planner is *also* a per-day drawing surface, so the natural
expectation is that it would follow the Day Doodle down the same personal/inline path. It does not.

## Decision

**1. A Daily Planner is a full Canvas — a new `DOCUMENT_KINDS` entry, not a personal inline doc.**

It lives in the `canvases` collection with an owner and members, opens at `/canvas/:id`, reuses the
entire canvas pipeline (creation, RTDB stroke storage per ADR 0001, snapshots, sharing, lists), and
**counts against the 10-Canvas limit**. It differs from the plain `canvas` kind only in three
template knobs on its `DocumentKind`: an `image` background (the "My Day" SVG, pinned to the
document extent and scaled with zoom), a `bounded` view (zoom-in allowed, pan clamped to the sheet
edges, no zoom-out past fit), and portrait dimensions sized to the template's printed proportions
(so default stroke/text sizes match a regular Canvas with no special-casing).

**2. Day→document links are stored per-user**, at `users/{uid}/plannerDays/{isoDate}` as an array
of `{canvasId, title, kind}`, parallel to `dayDoodles`. A link is *not* a field on the canvas doc.

## Alternatives considered

- **Daily Planner as a personal inline doc (like a Day Doodle).** Rejected: the user explicitly
  wanted it to behave "like the canvas" — shareable, listed among documents, full-screen — and to
  be linkable alongside ordinary Canvases. Reusing the canvas kind seam gives all of that for free;
  a parallel personal store would have to re-implement sharing, snapshots, and listing.
- **A `date` field on the canvas document.** Rejected: a Canvas can be **shared**, so it has no
  single owning day — whose planner would the field belong to? A per-user link keeps each member's
  planner independent and lets the same Canvas be pinned to several days.

## Consequences

- A Daily Planner consumes one of the user's 10 Canvas slots and appears in Documents/Home/search
  like any Canvas (distinguished by a calendar icon/label). This is intentional — it *is* a document.
- The two per-day drawing features now sit on **opposite sides of the personal/collaborative line**:
  Day Doodle (personal, inline, drawn on the calendar card) vs Daily Planner (collaborative Canvas,
  linked to the day). The dividing question is the same one ADR 0003 used: collaboration and
  access pattern, not "is it pinned to a date."
- Links can **dangle**: deleting a linked Canvas elsewhere leaves a stale link. Resolved lazily —
  the side panel fetches each linked canvas and renders missing ones as **unavailable** for removal,
  rather than eagerly cleaning up links on delete.
- Per-user link writes are whole-document read-modify-writes (a day holds only a handful of links),
  so cross-tab last-write-wins is possible but harmless at this scale — the same trade-off ADR 0003
  accepted for Day Doodles.
