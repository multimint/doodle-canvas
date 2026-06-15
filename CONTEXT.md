# Doodle Canvas — Domain Glossary

## Canvas
A fixed-size (1920×1080) drawing surface owned by a single **User**. A Canvas has a list of **Members** who may draw on it. A User may own at most 10 Canvases.

## Stroke
A single drawing action recorded on a Canvas. A Stroke has a `type` (path, rect, circle, line, text) and carries Konva shape properties as its `data`. A Stroke has exactly one **Author** (the User who created it). Any Member may delete any Stroke.

## Stroke Cap
The maximum number of Strokes a Canvas may hold (2,000). When the cap is reached, drawing is disabled and Members must clear the Canvas before adding new Strokes. Enforced in both RTDB Security Rules and the client.

## Member
A User who has been granted access to a Canvas by its Owner. Members may draw, erase, and delete any Stroke on the Canvas. A Member may voluntarily **Leave** a Canvas; doing so revokes their access permanently until the Owner re-invites them. Strokes authored by a departing Member remain on the Canvas.

## Owner
The User who created a Canvas. The Owner may invite others by email to become Members, remove any Member, cancel Pending Invites, and delete the Canvas.

## Pending Invite
An email address recorded on a Canvas that has not yet been claimed. When a User logs in for the first time and their email matches a Pending Invite, they are promoted to Member automatically.

## Presence
The real-time record of which Users are currently active on a Canvas, including their cursor position, display name, and avatar. Presence is ephemeral — it is removed when the user disconnects.

## Session
The period a User is actively connected to a Canvas. Presence exists only within a Session.

## Guest Session
A Session in which the User is identified by a temporary anonymous account rather than a verified identity. A Guest may own and draw on a single Canvas. The Canvas is scheduled for automatic deletion 7 days after creation. If the Guest signs in with Google during the Session, the anonymous account is upgraded in place, the Canvas is retained, and the deletion schedule is cancelled. If the browser is closed without signing in, the Canvas is eventually purged.

## Undo Stack
A per-client, in-memory list of Stroke IDs that the current User has created in this Session. Undo removes the most recent Stroke ID from the stack and deletes that Stroke from the Canvas. The Undo Stack is not persisted.
