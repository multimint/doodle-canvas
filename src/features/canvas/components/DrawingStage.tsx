import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Text, Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stroke, StrokeData, ToolType } from '../../../lib/types';
import {
  buildStrokeData,
  MIN_TEXT_WIDTH,
  MIN_TEXT_HEIGHT,
} from '../utils/strokeSerializer';
import {
  handleAnchor,
  textAABB,
  aabbOverlap,
  resizeFromPointer,
  RESIZE_HANDLES,
  type Box,
  type AABB,
} from '../utils/textBoxGeometry';
import {
  renderShape,
  descriptorFromStroke,
  descriptorFromLive,
  type SimpleStrokeType,
} from '../render/strokeShapes';
import { BoxControls } from './BoxControls';
import { TextBoxEditor } from './TextBoxEditor';
import { useViewport } from '../hooks/useViewport';
import type { LiveStroke } from '../hooks/useLiveStrokes';
import { useWiggle } from '../hooks/useWiggle';

export interface NavHandle {
  applyViewport: (zoom: number, pan: { x: number; y: number }) => void;
  getLayer: () => Konva.Layer | null;
}

interface Props {
  strokes: Stroke[];
  tool: ToolType;
  color: string;
  strokeWidth: number;
  disabled: boolean;
  onStrokeComplete: (stroke: Omit<Stroke, 'id'>) => void;
  onMouseMove: (x: number, y: number) => void;
  onMouseLeave: () => void;
  onDeleteStroke: (id: string) => void;
  onUpdateStroke?: (id: string, patch: Partial<StrokeData>) => void;
  onToolChange?: (tool: ToolType) => void;
  onViewportChange?: (zoom: number, pan: { x: number; y: number }) => void;
  stageRef: React.RefObject<Konva.Stage>;
  navRef?: React.MutableRefObject<NavHandle | null>;
  overlay?: React.ReactNode;
  remoteStrokes?: Record<string, LiveStroke>;
  onLiveUpdate?: (stroke: LiveStroke | null) => void;
  wiggle?: boolean;
}

export function DrawingStage({
  strokes,
  tool,
  color,
  strokeWidth,
  disabled,
  onStrokeComplete,
  onMouseMove,
  onMouseLeave,
  onDeleteStroke,
  onUpdateStroke,
  onToolChange,
  onViewportChange,
  stageRef,
  navRef,
  overlay,
  remoteStrokes,
  onLiveUpdate,
  wiggle = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const liveLineRef = useRef<Konva.Line | null>(null);
  const liveShapeRef = useRef<Konva.Shape | null>(null);

  // Drawing state
  const isDrawing = useRef(false);
  const livePointsRef = useRef<number[]>([]);
  const liveStartRef = useRef<{ x: number; y: number } | null>(null);
  const [livePoints, setLivePoints] = useState<number[]>([]);

  // The single ACTIVE Text Box — the one box being created, selected, or edited.
  // One geometry source for the border, the resize/rotate handles, the live text
  // reflow, AND the editor textarea, so they can never drift apart. Meanings:
  //   id === null            -> creating a brand-new box (commit builds the stroke)
  //   editing === true       -> textarea open (Konva text for this id is hidden)
  //   editing === false      -> just selected (Konva text visible, handles shown)
  // x/y/width/height are the UNROTATED top-left frame; rotation in degrees.
  const [active, setActive] = useState<{
    id: string | null;
    editing: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    fontSize: number;
    color: string;
    strokeWidth: number;
    initial: string;
  } | null>(null);
  // Transient geometry while resizing a box in a MULTI-selection — overrides the
  // box's stored geometry so it reflows live. Cleared once the persisted stroke
  // catches up (see reconcile effect below). Single-box transforms write `active`.
  const [xform, setXform] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  // Box captured at the start of a handle drag — fixed frame for stable math.
  const handleStartRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);

  // Multi-selection (marquee). When 2+ Text Boxes are selected they move/delete as a
  // group with no rotate/resize — single selection (above) keeps the full handles.
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [multiRect, setMultiRect] = useState<Box | null>(null); // group AABB (no rotation)
  const [multiOffset, setMultiOffset] = useState<{
    dx: number;
    dy: number;
  } | null>(null); // live drag delta
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const marqueeRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null); // latest, for mouseup
  const isMarquee = useRef(false);
  const multiDragStart = useRef<{ x: number; y: number } | null>(null);

  // Clear every selection state (single + multi). Used on empty-canvas click / tool change.
  const clearSelection = useCallback(() => {
    setActive(null);
    setXform(null);
    setMultiIds([]);
    setMultiRect(null);
    setMultiOffset(null);
  }, []);

  // Pending-commit: keep live line visible until the committed stroke arrives from Firebase
  const pendingCommitRef = useRef(false);
  const strokesAtCommitRef = useRef(0);
  const strokesLenRef = useRef(strokes.length);
  strokesLenRef.current = strokes.length;

  // Pan state (hand-tool drag)
  const isPanning = useRef(false);
  const lastClientPos = useRef({ x: 0, y: 0 });

  // Abandon any in-progress stroke (used when a pinch gesture starts).
  const cancelStroke = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    livePointsRef.current = [];
    liveStartRef.current = null;
    setLivePoints([]);
    onLiveUpdate?.(null);
  }, [onLiveUpdate]);

  const {
    zoom,
    pan,
    zoomRef,
    containerSize,
    panBy,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useViewport({
    stageRef,
    containerRef,
    layerRef,
    navRef,
    onViewportChange,
    onPinchStart: cancelStroke,
  });

  const { registerStroke, unregisterStroke, registerLive, unregisterLive } =
    useWiggle(layerRef, wiggle);

  // Stable ref callbacks keyed by stroke ID — prevents unregister/register churn on every re-render
  const refCacheRef = useRef<Map<string, (node: Konva.Node | null) => void>>(
    new Map(),
  );
  const getRefCb = useCallback(
    (stroke: Stroke) => {
      let cb = refCacheRef.current.get(stroke.id);
      if (!cb) {
        cb = (node: Konva.Node | null) => {
          if (node) registerStroke(stroke.id, node, stroke);
          else {
            unregisterStroke(stroke.id);
            refCacheRef.current.delete(stroke.id);
          }
        };
        refCacheRef.current.set(stroke.id, cb);
      }
      return cb;
    },
    [registerStroke, unregisterStroke],
  );

  // Stable callback refs so renderShape can hand the live nodes to the wiggle
  // registration effect without re-attaching the ref on every render.
  const liveLineCb = useCallback((node: Konva.Node | null) => {
    liveLineRef.current = node as Konva.Line | null;
  }, []);
  const liveShapeCb = useCallback((node: Konva.Node | null) => {
    liveShapeRef.current = node as Konva.Shape | null;
  }, []);

  // Canvas coords from Konva (accounts for stage x/y/scale automatically)
  const getPos = () =>
    stageRef.current?.getRelativePointerPosition() ?? { x: 0, y: 0 };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === 'hand') {
      isPanning.current = true;
      if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
      lastClientPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    // Idle mode: dragging empty canvas rubber-bands a marquee to multi-select;
    // Text Boxes handle their own click/drag via Konva node handlers. Never draws.
    if (tool === 'select') {
      if (e.target === stageRef.current) {
        // If a box is mid-edit, this empty-canvas click is "click away to finish":
        // let the textarea's blur commit the text. Clearing `active` here would race
        // ahead of that blur (React flushes this discrete event before the browser
        // dispatches blur), so handleEditingCommit would see active===null and drop
        // the edit. Bail and let the commit run; it sets active to null itself.
        if (active?.editing) return;
        clearSelection();
        const { x, y } = getPos();
        isMarquee.current = true;
        marqueeRef.current = { x0: x, y0: y, x1: x, y1: y };
        setMarquee(marqueeRef.current);
      }
      return;
    }
    if (disabled) return;
    if (tool === 'text') {
      // Drag-to-size like rect; a plain click becomes a default-width box on mouseup.
      isDrawing.current = true;
      const { x, y } = getPos();
      const pts = [x, y, x, y];
      livePointsRef.current = pts;
      liveStartRef.current = { x, y };
      setLivePoints(pts);
      return;
    }
    pendingCommitRef.current = false; // new stroke starts — cancel any held live line
    isDrawing.current = true;
    const { x, y } = getPos();
    const pts = [x, y, x, y];
    livePointsRef.current = pts;
    liveStartRef.current = { x, y };
    setLivePoints(pts);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === 'hand') {
      if (!isPanning.current) return;
      const dx = e.evt.clientX - lastClientPos.current.x;
      const dy = e.evt.clientY - lastClientPos.current.y;
      lastClientPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      panBy(dx, dy);
      return;
    }

    const { x, y } = getPos();
    onMouseMove(x, y);

    if (isMarquee.current && marqueeRef.current) {
      marqueeRef.current = { ...marqueeRef.current, x1: x, y1: y };
      setMarquee(marqueeRef.current);
      return;
    }

    if (!isDrawing.current) return;

    let newPoints: number[];
    if (tool === 'pen' || tool === 'brush' || tool === 'eraser') {
      newPoints = [...livePointsRef.current, x, y];
    } else if (liveStartRef.current) {
      newPoints = [liveStartRef.current.x, liveStartRef.current.y, x, y];
    } else {
      return;
    }

    livePointsRef.current = newPoints;
    setLivePoints(newPoints);

    // Text Boxes don't stream live (no remote 'text' live render) — skip the emit.
    if (tool === 'text') return;
    const strokeType = (tool === 'pen' ? 'path' : tool) as Stroke['type'];
    onLiveUpdate?.({ type: strokeType, points: newPoints, color, strokeWidth });
  };

  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      if (containerRef.current) containerRef.current.style.cursor = 'grab';
      return;
    }
    // Finish a marquee drag: select every Text Box whose box overlaps it.
    if (isMarquee.current) {
      isMarquee.current = false;
      const m = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      if (!m) return;
      const box: AABB = {
        minX: Math.min(m.x0, m.x1),
        minY: Math.min(m.y0, m.y1),
        maxX: Math.max(m.x0, m.x1),
        maxY: Math.max(m.y0, m.y1),
      };
      // A near-zero marquee is really a click on empty canvas: just deselect, rather
      // than point-selecting a box whose (rotated) AABB happens to contain the point.
      const clickEps = 3 / zoomRef.current;
      if (box.maxX - box.minX < clickEps && box.maxY - box.minY < clickEps) {
        clearSelection();
        return;
      }
      const hits = strokes.filter(
        (s) => s.type === 'text' && aabbOverlap(box, textAABB(s.data)),
      );
      if (hits.length === 0) {
        clearSelection();
        return;
      }
      if (hits.length === 1) {
        // A single hit behaves like a normal click-select (full handles + editing).
        const d = hits[0].data;
        setMultiIds([]);
        setMultiRect(null);
        setActive({
          id: hits[0].id,
          editing: false,
          x: d.x ?? 0,
          y: d.y ?? 0,
          width: d.width ?? MIN_TEXT_WIDTH,
          height: d.height ?? MIN_TEXT_HEIGHT,
          rotation: d.rotation ?? 0,
          fontSize: d.fontSize ?? 24,
          color: d.fill ?? d.stroke ?? '#14151c',
          strokeWidth,
          initial: d.text ?? '',
        });
        return;
      }
      // 2+ hits -> group selection (move + delete only).
      const u = hits.reduce<AABB>(
        (acc, s) => {
          const a = textAABB(s.data);
          return {
            minX: Math.min(acc.minX, a.minX),
            minY: Math.min(acc.minY, a.minY),
            maxX: Math.max(acc.maxX, a.maxX),
            maxY: Math.max(acc.maxY, a.maxY),
          };
        },
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      setActive(null);
      setXform(null);
      setMultiIds(hits.map((s) => s.id));
      setMultiRect({
        x: u.minX,
        y: u.minY,
        width: u.maxX - u.minX,
        height: u.maxY - u.minY,
      });
      setMultiOffset(null);
      return;
    }
    // Tool switched to 'hand' mid-stroke — abandon without committing
    if (tool === 'hand') {
      isDrawing.current = false;
      livePointsRef.current = [];
      liveStartRef.current = null;
      setLivePoints([]);
      onLiveUpdate?.(null);
      return;
    }

    // Text: open the editing overlay instead of committing immediately (must
    // run before the generic commit path, else we'd create an empty stroke too).
    if (tool === 'text') {
      const pts = livePointsRef.current;
      const start = liveStartRef.current;
      isDrawing.current = false;
      livePointsRef.current = [];
      liveStartRef.current = null;
      setLivePoints([]);
      if (!start) return; // not actually drawing (e.g. spurious mouseleave)
      const x1 = start.x,
        y1 = start.y;
      const x2 = pts[2] ?? x1,
        y2 = pts[3] ?? y1;
      setActive({
        id: null,
        editing: true,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.max(MIN_TEXT_WIDTH, Math.abs(x2 - x1)),
        height: Math.max(MIN_TEXT_HEIGHT, Math.abs(y2 - y1)),
        rotation: 0,
        fontSize: strokeWidth * 4 + 8,
        color,
        strokeWidth,
        initial: '',
      });
      return;
    }

    const points = livePointsRef.current;
    if (!isDrawing.current || points.length < 4) {
      isDrawing.current = false;
      livePointsRef.current = [];
      liveStartRef.current = null;
      setLivePoints([]);
      onLiveUpdate?.(null);
      return;
    }
    isDrawing.current = false;

    const rtool = tool === 'pen' ? 'path' : tool;
    const data = buildStrokeData(tool, points, color, strokeWidth);
    onStrokeComplete({
      type: rtool as Stroke['type'],
      authorId: '',
      data,
      timestamp: Date.now(),
    });

    // Keep live line visible until the committed stroke arrives from Firebase.
    // The useEffect on strokes calls setLivePoints([]) once strokes.length grows.
    liveStartRef.current = null;
    pendingCommitRef.current = true;
    strokesAtCommitRef.current = strokesLenRef.current;
    onLiveUpdate?.(null);
  }, [
    tool,
    color,
    strokeWidth,
    onStrokeComplete,
    onLiveUpdate,
    strokes,
    clearSelection,
  ]);

  // Side effects must live OUTSIDE setActive's updater — StrictMode double-invokes
  // updater fns in dev, which would commit the new stroke twice. The editor's own
  // `done` ref guarantees this runs once per editing session.
  const handleEditingCommit = useCallback(
    (text: string) => {
      if (!active) return;
      const trimmed = text.trim();
      if (active.id === null) {
        if (trimmed) {
          const data = buildStrokeData(
            'text',
            [
              active.x,
              active.y,
              active.x + active.width,
              active.y + active.height,
            ],
            active.color,
            active.strokeWidth,
            { text: trimmed },
          );
          // Carry the resized/rotated geometry through (buildStrokeData only sizes from
          // the points, so width/height/rotation set via handles must be applied here).
          data.width = active.width;
          data.height = active.height;
          data.rotation = active.rotation;
          onStrokeComplete({
            type: 'text',
            authorId: '',
            data,
            timestamp: Date.now(),
          });
        }
        onToolChange?.('select'); // auto-drop to idle after creating
        setActive(null);
      } else if (trimmed) {
        onUpdateStroke?.(active.id, { text: trimmed });
        // Commit fully exits to idle (no selection box / handles).
        setActive(null);
      } else {
        onDeleteStroke(active.id);
        setActive(null);
      }
    },
    [active, onStrokeComplete, onUpdateStroke, onDeleteStroke, onToolChange],
  );

  // Select a Text Box in idle mode, capturing its current bounds for the outline.
  // Nodes render around their centre (offsetX/Y = half size), so the unrotated
  // top-left is node position minus offset.
  // Select a Text Box (single-select) from its stroke data. The box renders as a
  // draggable Group now, so we read geometry from `data` rather than node attrs.
  const selectStroke = useCallback(
    (s: Stroke) => {
      setMultiIds([]);
      setMultiRect(null);
      setMultiOffset(null); // single-select replaces any group
      const d = s.data;
      setActive({
        id: s.id,
        editing: false,
        x: d.x ?? 0,
        y: d.y ?? 0,
        width: d.width ?? MIN_TEXT_WIDTH,
        height: d.height ?? MIN_TEXT_HEIGHT,
        rotation: d.rotation ?? 0,
        fontSize: d.fontSize ?? 24,
        color: d.fill ?? d.stroke ?? '#14151c',
        strokeWidth,
        initial: d.text ?? '',
      });
    },
    [strokeWidth],
  );

  const openEditExisting = useCallback(
    (stroke: Stroke) => {
      const d = stroke.data;
      const x = d.x ?? 0,
        y = d.y ?? 0;
      const width = d.width ?? MIN_TEXT_WIDTH,
        height = d.height ?? MIN_TEXT_HEIGHT;
      const rotation = d.rotation ?? 0;
      setMultiIds([]);
      setMultiRect(null);
      setMultiOffset(null);
      setActive({
        id: stroke.id,
        editing: true,
        x,
        y,
        width,
        height,
        rotation,
        fontSize: d.fontSize ?? 24,
        color: d.fill ?? d.stroke ?? '#14151c',
        strokeWidth,
        initial: d.text ?? '',
      });
    },
    [strokeWidth],
  );

  // Clear selection whenever we leave idle mode (so the outline never haunts other
  // tools) — but KEEP an open editor: creating a new box runs under the 'text' tool.
  useEffect(() => {
    if (tool === 'select') return;
    setActive((prev) => (prev && prev.editing ? prev : null));
    setXform(null);
    setMultiIds([]);
    setMultiRect(null);
    setMultiOffset(null);
  }, [tool]);

  // Drop the transient transform once the persisted stroke matches it — avoids
  // reverting to the old geometry for a frame before the RTDB write lands.
  useEffect(() => {
    if (!xform) return;
    const s = strokes.find((x) => x.id === xform.id);
    const d = s?.data;
    if (
      d &&
      d.x === xform.x &&
      d.y === xform.y &&
      d.width === xform.width &&
      d.height === xform.height &&
      (d.rotation ?? 0) === xform.rotation
    ) {
      setXform(null);
    }
  }, [strokes, xform]);

  // Delete/Backspace removes the selected Text Box(es) — but not while typing in any
  // field (topbar title rename is an <input>, the editor is a <textarea>).
  useEffect(() => {
    const single = active && !active.editing && active.id ? active.id : null;
    if (!single && multiIds.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)
        return;
      e.preventDefault();
      if (multiIds.length) {
        multiIds.forEach((id) => onDeleteStroke(id));
        setMultiIds([]);
        setMultiRect(null);
        setMultiOffset(null);
      } else if (single) {
        onDeleteStroke(single);
        setActive(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, multiIds, onDeleteStroke]);

  const renderStroke = (stroke: Stroke) => {
    const { data } = stroke;
    switch (stroke.type) {
      case 'text': {
        const isActive = active?.id === stroke.id;
        // Single geometry source: `active` (this box being created/selected/edited)
        // overrides while it owns the box, else `xform` (multi-select live resize),
        // else the persisted `data`.
        const geo = isActive ? active! : xform?.id === stroke.id ? xform : data;
        // Legacy text strokes (pre-Text-Box feature) have no width/height; fall back
        // to the minimums so they still render as a sized box instead of collapsing.
        const w = geo.width ?? MIN_TEXT_WIDTH,
          h = geo.height ?? MIN_TEXT_HEIGHT;
        const rot = geo.rotation ?? 0;
        // In a group selection, follow the live group-drag offset; the group box
        // owns the drag, so the node itself isn't individually draggable.
        const inMulti = multiIds.includes(stroke.id);
        const off = inMulti && multiOffset ? multiOffset : { dx: 0, dy: 0 };
        const gx = (geo.x ?? 0) + off.dx,
          gy = (geo.y ?? 0) + off.dy;
        // While this box is being edited, hide the Konva text and let the textarea
        // render it, so the caret sits on the very text it's editing. (A DOM caret
        // can't be aligned to a separately canvas-drawn glyph.)
        const editingThis = isActive && active!.editing;
        const movable = tool === 'select' && !inMulti && !editingThis;
        // The box is a draggable Group at the box centre (rotated). Its <Text> and —
        // when active — its border/handles are CHILDREN, so a move drags them together
        // with no React-state lag between text and border. Resize/rotate handles are
        // draggable children, so grabbing one drags it, not the group.
        return (
          <Group
            key={stroke.id}
            x={gx + w / 2}
            y={gy + h / 2}
            offsetX={w / 2}
            offsetY={h / 2}
            rotation={rot}
            draggable={movable}
            onClick={() => {
              if (tool === 'select') selectStroke(stroke);
            }}
            onTap={() => {
              if (tool === 'select') selectStroke(stroke);
            }}
            onDblClick={() => {
              if (tool === 'select') openEditExisting(stroke);
            }}
            onDblTap={() => {
              if (tool === 'select') openEditExisting(stroke);
            }}
            onDragStart={(e) => {
              // Konva drag events bubble: dragging a child handle (rotate knob / resize
              // handle) fires this too, with e.target as the handle. Only treat it as a
              // box move when the Group itself is the drag target.
              if (e.target !== e.currentTarget) return;
              if (!isActive) selectStroke(stroke);
            }}
            onDragMove={(e) => {
              if (e.target !== e.currentTarget) return;
              const nx = e.target.x() - w / 2,
                ny = e.target.y() - h / 2;
              setActive((prev) =>
                prev && prev.id === stroke.id
                  ? { ...prev, x: nx, y: ny }
                  : prev,
              );
            }}
            onDragEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              const nx = e.target.x() - w / 2,
                ny = e.target.y() - h / 2;
              onUpdateStroke?.(stroke.id, { x: nx, y: ny });
              setActive((prev) =>
                prev && prev.id === stroke.id
                  ? { ...prev, x: nx, y: ny }
                  : prev,
              );
            }}
          >
            <Text
              id={stroke.id}
              ref={getRefCb(stroke)}
              listening
              x={0}
              y={0}
              text={data.text}
              fontSize={data.fontSize}
              fill={data.fill ?? data.stroke}
              fontFamily='sans-serif'
              width={w}
              height={h}
              wrap='word'
              align='center'
              verticalAlign='middle'
              visible={!editingThis}
            />
            {isActive && (
              <BoxControls
                w={w}
                h={h}
                zoom={zoom}
                editing={active!.editing}
                stageRef={stageRef}
                handleStartRef={handleStartRef}
                geom={active!}
                onChange={(p) =>
                  setActive((prev) => (prev ? { ...prev, ...p } : prev))
                }
                onCommit={() => {
                  if (active!.id)
                    onUpdateStroke?.(active!.id, {
                      x: active!.x,
                      y: active!.y,
                      width: active!.width,
                      height: active!.height,
                      rotation: active!.rotation,
                    });
                }}
              />
            )}
          </Group>
        );
      }
      default:
        return renderShape(
          stroke.type as SimpleStrokeType,
          descriptorFromStroke(data),
          {
            key: stroke.id,
            id: stroke.id,
            listening: true,
            ref: getRefCb(stroke),
            onDblClick: () => onDeleteStroke(stroke.id),
          },
        );
    }
  };

  // Another client's in-progress stroke (text never streams, so it can't appear here).
  const renderRemoteLiveStroke = (uid: string, s: LiveStroke) => {
    if (s.points.length < 4 || s.type === 'text') return null;
    return renderShape(s.type as SimpleStrokeType, descriptorFromLive(s), {
      key: `live-${uid}`,
      listening: false,
    });
  };

  useEffect(() => {
    if (livePoints.length >= 4) {
      if (tool === 'brush') {
        const node = liveShapeRef.current;
        if (node) registerLive(node, null);
      } else {
        const node = liveLineRef.current;
        if (node) registerLive(node, livePointsRef);
      }
    } else {
      unregisterLive();
    }
    return () => unregisterLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePoints.length >= 4, tool]);

  // Clear the live line once the Firebase-confirmed stroke arrives so the stroke
  // is never invisible between mouseup and the committed shape mounting.
  useEffect(() => {
    if (
      pendingCommitRef.current &&
      strokes.length > strokesAtCommitRef.current
    ) {
      pendingCommitRef.current = false;
      livePointsRef.current = [];
      setLivePoints([]);
    }
  }, [strokes]);

  // This client's in-progress stroke. Text shows a dashed sizing rectangle; the
  // drawable tools route through the same shape registry as committed strokes, with
  // the live nodes wired to the wiggle registration via stable callback refs.
  const renderLiveStroke = () => {
    if (livePoints.length < 4) return null;
    if (tool === 'text') {
      const [x1, y1, x2, y2] = livePoints;
      return (
        <Rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          stroke={color}
          strokeWidth={1 / zoom}
          dash={[6 / zoom, 4 / zoom]}
          fill='transparent'
          listening={false}
        />
      );
    }
    if (
      tool !== 'pen' &&
      tool !== 'brush' &&
      tool !== 'eraser' &&
      tool !== 'rect' &&
      tool !== 'circle' &&
      tool !== 'line'
    ) {
      return null; // hand / select don't draw
    }
    const type: SimpleStrokeType = tool === 'pen' ? 'path' : tool;
    return renderShape(
      type,
      descriptorFromLive({ type, points: livePoints, color, strokeWidth }),
      {
        listening: false,
        ref:
          tool === 'brush'
            ? liveShapeCb
            : tool === 'pen'
              ? liveLineCb
              : undefined,
      },
    );
  };

  const cursor =
    tool === 'hand'
      ? 'grab'
      : tool === 'select'
        ? 'default'
        : disabled
          ? 'not-allowed'
          : tool === 'eraser'
            ? 'cell'
            : tool === 'text'
              ? 'text'
              : 'crosshair';

  return (
    <div
      className='stage-container'
      ref={containerRef}
      style={{ position: 'relative' }}
    >
      {containerSize.w > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.w}
          height={containerSize.h}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            onMouseLeave();
          }}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor }}
        >
          <Layer ref={layerRef}>
            {strokes.map(renderStroke)}
            {remoteStrokes &&
              Object.entries(remoteStrokes).map(([uid, s]) =>
                renderRemoteLiveStroke(uid, s),
              )}
            {!disabled && renderLiveStroke()}
            {/* Create-only overlay: a brand-new box (active.id === null) has no committed
                stroke yet, so it has no draggable Group of its own — render its border +
                rotate knob + 8 resize handles + edit catcher here. Committed boxes draw
                the same controls as children of their stroke Group (see renderStroke),
                so border + text move together on drag. Handles write `active`; persist is
                a no-op until the text commits. */}
            {active &&
              active.id === null &&
              (() => {
                const W = active.width,
                  H = active.height;
                const hs = 11 / zoom;
                const rotGap = 26 / zoom;
                const st0 = {
                  x: active.x,
                  y: active.y,
                  width: active.width,
                  height: active.height,
                  rotation: active.rotation,
                };
                const persist = () => {
                  if (active.id)
                    onUpdateStroke?.(active.id, {
                      x: active.x,
                      y: active.y,
                      width: active.width,
                      height: active.height,
                      rotation: active.rotation,
                    });
                };
                // Group transformed exactly like the box: at box centre, rotated, so local
                // coords (0,0)..(W,H) trace the box.
                return (
                  <Group
                    x={active.x + W / 2}
                    y={active.y + H / 2}
                    offsetX={W / 2}
                    offsetY={H / 2}
                    rotation={active.rotation}
                  >
                    {/* Full-box catcher (edit only): mousedown preventDefault keeps the
                      textarea focused, so clicking the empty box area never commits.
                      Below the handles (declared first), above the canvas text. */}
                    {active.editing && (
                      <Rect
                        x={0}
                        y={0}
                        width={W}
                        height={H}
                        fill='transparent'
                        onMouseDown={(e) => {
                          e.evt.preventDefault();
                        }}
                      />
                    )}
                    <Rect
                      x={0}
                      y={0}
                      width={W}
                      height={H}
                      stroke='#3d5afe'
                      strokeWidth={1.5 / zoom}
                      dash={[6 / zoom, 4 / zoom]}
                      listening={false}
                    />
                    {/* Rotate knob above the top edge */}
                    <Line
                      points={[W / 2, 0, W / 2, -rotGap]}
                      stroke='#3d5afe'
                      strokeWidth={1.5 / zoom}
                      listening={false}
                    />
                    <Rect
                      x={W / 2 - hs / 2}
                      y={-rotGap - hs / 2}
                      width={hs}
                      height={hs}
                      cornerRadius={hs / 2}
                      fill='#ffffff'
                      stroke='#3d5afe'
                      strokeWidth={1.5 / zoom}
                      hitStrokeWidth={22 / zoom}
                      draggable
                      onMouseDown={(e) => {
                        e.evt.preventDefault();
                      }}
                      onMouseEnter={(e) => {
                        const c = e.target.getStage()?.container();
                        if (c) c.style.cursor = 'grab';
                      }}
                      onMouseLeave={(e) => {
                        const c = e.target.getStage()?.container();
                        if (c) c.style.cursor = 'default';
                      }}
                      onDragStart={() => {
                        handleStartRef.current = st0;
                      }}
                      onDragMove={(e) => {
                        const st = handleStartRef.current;
                        const wp =
                          stageRef.current?.getRelativePointerPosition();
                        if (!st || !wp) return;
                        const cx = st.x + st.width / 2,
                          cy = st.y + st.height / 2;
                        const ang =
                          (Math.atan2(wp.y - cy, wp.x - cx) * 180) / Math.PI +
                          90;
                        setActive((prev) =>
                          prev ? { ...prev, rotation: ang } : prev,
                        );
                        e.target.position({
                          x: st.width / 2 - hs / 2,
                          y: -rotGap - hs / 2,
                        });
                      }}
                      onDragEnd={persist}
                    />
                    {/* 8 resize handles, math done in the box's fixed start frame */}
                    {RESIZE_HANDLES.map(({ role, cursor: hCursor }) => {
                      const a = handleAnchor(role, {
                        x: 0,
                        y: 0,
                        width: W,
                        height: H,
                      });
                      return (
                        <Rect
                          key={role}
                          x={a.x - hs / 2}
                          y={a.y - hs / 2}
                          width={hs}
                          height={hs}
                          fill='#ffffff'
                          stroke='#3d5afe'
                          strokeWidth={1.5 / zoom}
                          hitStrokeWidth={22 / zoom}
                          draggable
                          onMouseDown={(e) => {
                            e.evt.preventDefault();
                          }}
                          onMouseEnter={(e) => {
                            const c = e.target.getStage()?.container();
                            if (c) c.style.cursor = hCursor;
                          }}
                          onMouseLeave={(e) => {
                            const c = e.target.getStage()?.container();
                            if (c) c.style.cursor = 'default';
                          }}
                          onDragStart={() => {
                            handleStartRef.current = st0;
                          }}
                          onDragMove={(e) => {
                            const st = handleStartRef.current;
                            const wp =
                              stageRef.current?.getRelativePointerPosition();
                            if (!st || !wp) return;
                            const nb = resizeFromPointer(role, st, wp);
                            setActive((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    x: nb.x,
                                    y: nb.y,
                                    width: nb.width,
                                    height: nb.height,
                                    rotation: nb.rotation,
                                  }
                                : prev,
                            );
                            const la = handleAnchor(role, {
                              x: 0,
                              y: 0,
                              width: nb.width,
                              height: nb.height,
                            });
                            e.target.position({
                              x: la.x - hs / 2,
                              y: la.y - hs / 2,
                            });
                          }}
                          onDragEnd={persist}
                        />
                      );
                    })}
                  </Group>
                );
              })()}
            {/* Rubber-band marquee while dragging on empty canvas. Solid thin line
                + translucent fill — deliberately distinct from the dashed outlines
                that mark a finished selection. */}
            {marquee &&
              (() => {
                const mx = Math.min(marquee.x0, marquee.x1),
                  my = Math.min(marquee.y0, marquee.y1);
                const mw = Math.abs(marquee.x1 - marquee.x0),
                  mh = Math.abs(marquee.y1 - marquee.y0);
                return (
                  <Rect
                    x={mx}
                    y={my}
                    width={mw}
                    height={mh}
                    stroke='#3d5afe'
                    strokeWidth={1 / zoom}
                    fill='rgba(61,90,254,0.12)'
                    listening={false}
                  />
                );
              })()}
            {/* Group selection (2+ boxes): drag the transparent union Rect to move all,
                Delete to remove all. Each box also shows its own dashed outline plus
                8 resize ("expand") handles — but NO rotate. Resizing a handle affects
                only that one box; only move/delete act on the whole group. */}
            {multiIds.length > 1 &&
              multiRect &&
              (() => {
                const off = multiOffset ?? { dx: 0, dy: 0 };
                const hs = 11 / zoom;
                // Recompute the union bounds from current geometry (xform overrides the
                // box being resized) so the group-move area tracks a resize.
                const recomputeUnion = () => {
                  const u = multiIds.reduce<AABB>(
                    (acc, mid) => {
                      const ms = strokes.find((k) => k.id === mid);
                      if (!ms) return acc;
                      const g = xform?.id === mid ? xform : ms.data;
                      const a = textAABB(g);
                      return {
                        minX: Math.min(acc.minX, a.minX),
                        minY: Math.min(acc.minY, a.minY),
                        maxX: Math.max(acc.maxX, a.maxX),
                        maxY: Math.max(acc.maxY, a.maxY),
                      };
                    },
                    {
                      minX: Infinity,
                      minY: Infinity,
                      maxX: -Infinity,
                      maxY: -Infinity,
                    },
                  );
                  setMultiRect({
                    x: u.minX,
                    y: u.minY,
                    width: u.maxX - u.minX,
                    height: u.maxY - u.minY,
                  });
                };
                return (
                  <>
                    {/* Group-move area: transparent, above box bodies but below handles. */}
                    <Rect
                      x={multiRect.x + off.dx}
                      y={multiRect.y + off.dy}
                      width={multiRect.width}
                      height={multiRect.height}
                      fill='transparent'
                      draggable
                      onClick={() => {
                        // The transparent move-rect covers the whole union, so a click
                        // in the empty gap between selected boxes lands here, not on the
                        // Stage — deselect all unless the click is actually on a box.
                        // (onClick only fires for a pure click, never after a drag.)
                        const wp =
                          stageRef.current?.getRelativePointerPosition();
                        if (!wp) return;
                        const overBox = multiIds.some((id) => {
                          const s = strokes.find((k) => k.id === id);
                          if (!s) return false;
                          const a = textAABB(s.data);
                          return (
                            wp.x >= a.minX &&
                            wp.x <= a.maxX &&
                            wp.y >= a.minY &&
                            wp.y <= a.maxY
                          );
                        });
                        if (!overBox) clearSelection();
                      }}
                      onMouseEnter={(e) => {
                        const c = e.target.getStage()?.container();
                        if (c) c.style.cursor = 'move';
                      }}
                      onMouseLeave={(e) => {
                        const c = e.target.getStage()?.container();
                        if (c) c.style.cursor = 'default';
                      }}
                      onDragStart={() => {
                        multiDragStart.current = {
                          x: multiRect.x,
                          y: multiRect.y,
                        };
                      }}
                      onDragMove={(e) => {
                        const st = multiDragStart.current;
                        if (!st) return;
                        setMultiOffset({
                          dx: e.target.x() - st.x,
                          dy: e.target.y() - st.y,
                        });
                      }}
                      onDragEnd={(e) => {
                        const st = multiDragStart.current;
                        multiDragStart.current = null;
                        if (!st) return;
                        const dx = e.target.x() - st.x,
                          dy = e.target.y() - st.y;
                        multiIds.forEach((id) => {
                          const s = strokes.find((k) => k.id === id);
                          if (s)
                            onUpdateStroke?.(id, {
                              x: (s.data.x ?? 0) + dx,
                              y: (s.data.y ?? 0) + dy,
                            });
                        });
                        setMultiRect({
                          x: st.x + dx,
                          y: st.y + dy,
                          width: multiRect.width,
                          height: multiRect.height,
                        });
                        setMultiOffset(null);
                      }}
                    />
                    {/* Per-box outline + resize handles (rendered above the move area). */}
                    {multiIds.map((id) => {
                      const s = strokes.find((k) => k.id === id);
                      if (!s) return null;
                      const g = xform?.id === id ? xform : s.data;
                      const W = g.width ?? 0,
                        H = g.height ?? 0;
                      const rot =
                        (xform?.id === id ? xform.rotation : s.data.rotation) ??
                        0;
                      const bx = (g.x ?? 0) + off.dx,
                        by = (g.y ?? 0) + off.dy;
                      const startRect = {
                        x: g.x ?? 0,
                        y: g.y ?? 0,
                        width: W,
                        height: H,
                        rotation: rot,
                      };
                      return (
                        <Group
                          key={`msel-${id}`}
                          x={bx + W / 2}
                          y={by + H / 2}
                          offsetX={W / 2}
                          offsetY={H / 2}
                          rotation={rot}
                        >
                          <Rect
                            x={0}
                            y={0}
                            width={W}
                            height={H}
                            stroke='#3d5afe'
                            strokeWidth={1.5 / zoom}
                            dash={[6 / zoom, 4 / zoom]}
                            listening={false}
                          />
                          {RESIZE_HANDLES.map(({ role, cursor: hCursor }) => {
                            const a = handleAnchor(role, {
                              x: 0,
                              y: 0,
                              width: W,
                              height: H,
                            });
                            return (
                              <Rect
                                key={role}
                                x={a.x - hs / 2}
                                y={a.y - hs / 2}
                                width={hs}
                                height={hs}
                                fill='#ffffff'
                                stroke='#3d5afe'
                                strokeWidth={1.5 / zoom}
                                hitStrokeWidth={22 / zoom}
                                draggable
                                onMouseEnter={(e) => {
                                  const c = e.target.getStage()?.container();
                                  if (c) c.style.cursor = hCursor;
                                }}
                                onMouseLeave={(e) => {
                                  const c = e.target.getStage()?.container();
                                  if (c) c.style.cursor = 'default';
                                }}
                                onDragStart={() => {
                                  handleStartRef.current = startRect;
                                }}
                                onDragMove={(e) => {
                                  const st = handleStartRef.current;
                                  const wp =
                                    stageRef.current?.getRelativePointerPosition();
                                  if (!st || !wp) return;
                                  const nb = resizeFromPointer(role, st, wp);
                                  setXform({ id, ...nb });
                                  const la = handleAnchor(role, {
                                    x: 0,
                                    y: 0,
                                    width: nb.width,
                                    height: nb.height,
                                  });
                                  e.target.position({
                                    x: la.x - hs / 2,
                                    y: la.y - hs / 2,
                                  });
                                }}
                                onDragEnd={() => {
                                  if (xform && xform.id === id) {
                                    onUpdateStroke?.(id, {
                                      x: xform.x,
                                      y: xform.y,
                                      width: xform.width,
                                      height: xform.height,
                                      rotation: xform.rotation,
                                    });
                                  }
                                  recomputeUnion();
                                }}
                              />
                            );
                          })}
                        </Group>
                      );
                    })}
                  </>
                );
              })()}
          </Layer>
        </Stage>
      )}

      {active?.editing && (active.id !== null || !disabled) && (
        <TextBoxEditor
          key={active.id ?? 'new'}
          x={active.x * zoom + pan.x}
          y={active.y * zoom + pan.y}
          width={active.width * zoom}
          height={active.height * zoom}
          fontSize={active.fontSize * zoom}
          rotation={active.rotation}
          color={active.color}
          initial={active.initial}
          onCommit={handleEditingCommit}
          onCancel={() => setActive(null)}
        />
      )}

      {overlay}
    </div>
  );
}
