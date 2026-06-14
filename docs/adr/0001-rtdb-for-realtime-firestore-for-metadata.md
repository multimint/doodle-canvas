# ADR 0001: Use RTDB for live canvas data and Firestore for metadata

**Status:** Accepted

## Context

The app requires two very different write patterns:

1. **High-frequency ephemeral writes** — cursor positions (20 events/sec/user), live strokes being drawn, and presence heartbeats. With 20 concurrent users this reaches ~400 writes/sec.
2. **Low-frequency structured writes** — canvas metadata, user records, email invites. These need querying by field (e.g. find canvases where `members` contains `uid`).

Firestore charges per document read/write and has a practical limit of ~1 write/sec per document. Using it for cursor sync would exhaust the Spark free tier in under 3 minutes of real drawing.

## Decision

Split storage by access pattern:

- **Firebase Realtime Database (RTDB)** for all live, high-frequency data: strokes in progress, cursor positions, and presence. RTDB pricing on Spark is based on storage (100MB) and transfer (1GB/month), not per-operation — making it far more economical for this workload.
- **Firestore** for all persistent, structured data: canvas documents, user records, and pending invites. Firestore's security rules and field-level queries are well-suited here.
- **Firebase Storage** for canvas snapshots (PNG). Every 100 strokes, the client that drew the 100th stroke uploads a snapshot via `stage.toDataURL()`. On load, clients fetch the latest snapshot then apply only strokes recorded after it — avoiding full stroke replay.

## Consequences

- The app maintains two Firebase connections (RTDB + Firestore), adding a small amount of SDK overhead.
- RTDB data (strokes, cursors, presence) must be cleaned up when a Canvas is deleted — Firestore deletion does not cascade to RTDB automatically.
- Snapshotting is triggered client-side every 100 strokes (pen + eraser combined). If the triggering client closes the tab before the upload completes, that snapshot is lost — the next 100-stroke boundary will trigger again. Acceptable for casual use.
- After a successful snapshot upload, all RTDB strokes with timestamp <= snapshotStrokeId are deleted to keep RTDB storage within the Spark 100MB cap.
- The canvas metadata document in Firestore stores `snapshotUrl` and `snapshotStrokeId` (the RTDB key of the last stroke included in the snapshot) so clients know which strokes to replay on top.
- The eraser tool does not delete existing strokes. It writes an eraser stroke to RTDB with `globalCompositeOperation: 'destination-out'`, which cuts out pixels on replay. All strokes must share a single Konva Layer — cross-layer erasure does not work.
- Firestore Security Rules must enforce canvas membership before allowing reads of canvas metadata; RTDB rules must do the same for live data paths.
