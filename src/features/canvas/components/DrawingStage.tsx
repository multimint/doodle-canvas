import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import {
  Stage,
  Layer,
  Line,
  Rect,
  Ellipse,
  Text,
  Shape,
  Group,
} from 'react-konva';
import type Konva from 'konva';
import { generateSprayPoints, brushSceneFunc } from '../utils/sprayUtils';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stroke, StrokeData, ToolType } from '../../../lib/types';
import {
  buildStrokeData,
  MIN_TEXT_WIDTH,
  MIN_TEXT_HEIGHT,
} from '../utils/strokeSerializer';
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

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

// Editor-only calibration, as a fraction of fontSize. The DOM textarea (edit state)
// and the Konva <Text> (committed) are both mathematically centered in the box, but
// canvas vs browser place glyphs on different baseline models, so the DOM text reads
// a few px down/right of the committed text. These shift ONLY the textarea to match
// the committed Konva text (the saved truth), so there's still no jump on commit.
// Positive = right / down; negative counters the observed down-right drift. Tune by eye.
const EDITOR_NUDGE_X = -0.03;
const EDITOR_NUDGE_Y = -0.03;

// 8 resize handles for a selected Text Box. role letters encode which edges move.
type HandleRole = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const RESIZE_HANDLES: { role: HandleRole; cursor: string }[] = [
  { role: 'nw', cursor: 'nwse-resize' },
  { role: 'n', cursor: 'ns-resize' },
  { role: 'ne', cursor: 'nesw-resize' },
  { role: 'e', cursor: 'ew-resize' },
  { role: 'se', cursor: 'nwse-resize' },
  { role: 's', cursor: 'ns-resize' },
  { role: 'sw', cursor: 'nesw-resize' },
  { role: 'w', cursor: 'ew-resize' },
];

type Box = { x: number; y: number; width: number; height: number };

function handleAnchor(role: HandleRole, b: Box): { x: number; y: number } {
  const left = b.x,
    right = b.x + b.width,
    top = b.y,
    bottom = b.y + b.height;
  const midX = (left + right) / 2,
    midY = (top + bottom) / 2;
  switch (role) {
    case 'nw':
      return { x: left, y: top };
    case 'n':
      return { x: midX, y: top };
    case 'ne':
      return { x: right, y: top };
    case 'e':
      return { x: right, y: midY };
    case 'se':
      return { x: right, y: bottom };
    case 's':
      return { x: midX, y: bottom };
    case 'sw':
      return { x: left, y: bottom };
    case 'w':
      return { x: left, y: midY };
  }
}

type AABB = { minX: number; minY: number; maxX: number; maxY: number };

// Axis-aligned bounding box of a (possibly rotated) Text Box, in world coords.
function textAABB(d: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}): AABB {
  const x = d.x ?? 0,
    y = d.y ?? 0,
    w = d.width ?? MIN_TEXT_WIDTH,
    h = d.height ?? MIN_TEXT_HEIGHT;
  const rot = ((d.rotation ?? 0) * Math.PI) / 180;
  if (!rot) return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  const cx = x + w / 2,
    cy = y + h / 2;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]) {
    const dx = px - cx,
      dy = py - cy;
    const rx = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
    const ry = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }
  return { minX, minY, maxX, maxY };
}

const aabbOverlap = (a: AABB, b: AABB) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

// Move the dragged edge(s) to the pointer; opposite edges stay anchored; clamp to min.
function computeResize(role: HandleRole, px: number, py: number, b: Box): Box {
  let left = b.x,
    right = b.x + b.width,
    top = b.y,
    bottom = b.y + b.height;
  if (role.includes('w')) left = Math.min(px, right - MIN_TEXT_WIDTH);
  if (role.includes('e')) right = Math.max(px, left + MIN_TEXT_WIDTH);
  if (role.includes('n')) top = Math.min(py, bottom - MIN_TEXT_HEIGHT);
  if (role.includes('s')) bottom = Math.max(py, top + MIN_TEXT_HEIGHT);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type RotBox = Box & { rotation: number };

// Given a resize handle role, the box's fixed start frame (st), and the world pointer,
// return the box's new world geometry. Unrotate pointer -> resize in local frame ->
// re-rotate the new centre back to world. Shared by single- and multi-select handles.
function resizeFromPointer(
  role: HandleRole,
  st: RotBox,
  wp: { x: number; y: number },
): RotBox {
  const cx = st.x + st.width / 2,
    cy = st.y + st.height / 2;
  const rad = (st.rotation * Math.PI) / 180;
  const dx = wp.x - cx,
    dy = wp.y - cy;
  const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
  const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad);
  const base = {
    x: -st.width / 2,
    y: -st.height / 2,
    width: st.width,
    height: st.height,
  };
  const nb = computeResize(role, lx, ly, base);
  const ocx = nb.x + nb.width / 2,
    ocy = nb.y + nb.height / 2;
  const wcx = cx + (ocx * Math.cos(rad) - ocy * Math.sin(rad));
  const wcy = cy + (ocx * Math.sin(rad) + ocy * Math.cos(rad));
  return {
    x: wcx - nb.width / 2,
    y: wcy - nb.height / 2,
    width: nb.width,
    height: nb.height,
    rotation: st.rotation,
  };
}

// Selection chrome (dashed border + rotate knob + 8 resize handles, plus an optional
// edit catcher) for the active Text Box. Rendered as CHILDREN of a Group that is
// already positioned at the box centre and rotated, so local coords (0,0)..(w,h)
// trace the box. Because it lives in the same Group as the box's <Text>, a move-drag
// of that Group carries the border with the text — no React-state lag / desync.
// Handle drags compute geometry in world space (via the box's fixed start frame) and
// report it through onChange; onCommit persists on release.
function BoxControls({
  w,
  h,
  zoom,
  editing,
  stageRef,
  handleStartRef,
  geom,
  onChange,
  onCommit,
}: {
  w: number;
  h: number;
  zoom: number;
  editing: boolean;
  stageRef: React.RefObject<Konva.Stage>;
  handleStartRef: React.MutableRefObject<RotBox | null>;
  geom: RotBox;
  onChange: (p: Partial<RotBox>) => void;
  onCommit: () => void;
}) {
  const hs = 11 / zoom;
  const rotGap = 26 / zoom;
  const st0: RotBox = {
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    rotation: geom.rotation,
  };
  return (
    <>
      {/* Full-box catcher (edit only): mousedown preventDefault keeps the textarea
          focused, so clicking the empty box area never commits. */}
      {editing && (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill='transparent'
          onMouseDown={(e) => {
            e.evt.preventDefault();
          }}
        />
      )}
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        stroke='#3d5afe'
        strokeWidth={1.5 / zoom}
        dash={[6 / zoom, 4 / zoom]}
        listening={false}
      />
      {/* Rotate knob above the top edge */}
      <Line
        points={[w / 2, 0, w / 2, -rotGap]}
        stroke='#3d5afe'
        strokeWidth={1.5 / zoom}
        listening={false}
      />
      <Rect
        x={w / 2 - hs / 2}
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
          const wp = stageRef.current?.getRelativePointerPosition();
          if (!st || !wp) return;
          const cx = st.x + st.width / 2,
            cy = st.y + st.height / 2;
          const ang = (Math.atan2(wp.y - cy, wp.x - cx) * 180) / Math.PI + 90;
          onChange({ rotation: ang });
          e.target.position({ x: st.width / 2 - hs / 2, y: -rotGap - hs / 2 });
        }}
        onDragEnd={onCommit}
      />
      {/* 8 resize handles, math done in the box's fixed start frame */}
      {RESIZE_HANDLES.map(({ role, cursor: hCursor }) => {
        const a = handleAnchor(role, { x: 0, y: 0, width: w, height: h });
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
              const wp = stageRef.current?.getRelativePointerPosition();
              if (!st || !wp) return;
              const nb = resizeFromPointer(role, st, wp);
              onChange({
                x: nb.x,
                y: nb.y,
                width: nb.width,
                height: nb.height,
                rotation: nb.rotation,
              });
              const la = handleAnchor(role, {
                x: 0,
                y: 0,
                width: nb.width,
                height: nb.height,
              });
              e.target.position({ x: la.x - hs / 2, y: la.y - hs / 2 });
            }}
            onDragEnd={onCommit}
          />
        );
      })}
    </>
  );
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
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const layerRef = useRef<Konva.Layer>(null);
  const liveLineRef = useRef<Konva.Line>(null);
  const liveShapeRef = useRef<Konva.Shape>(null);

  // Viewport — refs for synchronous access in handlers, state for rendering
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const initializedRef = useRef(false);

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

  // Pan state
  const isPanning = useRef(false);
  const lastClientPos = useRef({ x: 0, y: 0 });

  // Two-finger touch state
  const lastTouchRef = useRef<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

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

  const applyViewport = useCallback(
    (newZoom: number, newPan: { x: number; y: number }) => {
      zoomRef.current = newZoom;
      panRef.current = newPan;
      setZoom(newZoom);
      setPan(newPan);
      onViewportChange?.(newZoom, newPan);
    },
    [onViewportChange],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Prevent browser scroll when wheeling over canvas
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', preventScroll, { passive: false });

    // Prevent browser pinch-zoom / overscroll on two-finger touch
    const preventTwoFingerScroll = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    el.addEventListener('touchstart', preventTwoFingerScroll, {
      passive: false,
    });
    el.addEventListener('touchmove', preventTwoFingerScroll, {
      passive: false,
    });

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setContainerSize({ w: width, h: height });

      if (!initializedRef.current) {
        initializedRef.current = true;
        const fitZoom = Math.min(
          1,
          width / CANVAS_WIDTH,
          height / CANVAS_HEIGHT,
        );
        applyViewport(fitZoom, {
          x: (width - CANVAS_WIDTH * fitZoom) / 2,
          y: (height - CANVAS_HEIGHT * fitZoom) / 2,
        });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', preventScroll);
      el.removeEventListener('touchstart', preventTwoFingerScroll);
      el.removeEventListener('touchmove', preventTwoFingerScroll);
    };
  }, [applyViewport]);

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
      const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      applyViewport(zoomRef.current, newPan);
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

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    const dir = e.evt.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.round((zoomRef.current + dir * 0.1) * 10) / 10),
    );
    const ratio = newZoom / zoomRef.current;
    applyViewport(newZoom, {
      x: pointer.x - (pointer.x - panRef.current.x) * ratio,
      y: pointer.y - (pointer.y - panRef.current.y) * ratio,
    });
  };

  const handleTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) return;
    // Cancel any ongoing single-touch stroke
    if (isDrawing.current) {
      isDrawing.current = false;
      livePointsRef.current = [];
      liveStartRef.current = null;
      setLivePoints([]);
      onLiveUpdate?.(null);
    }
    const t = e.evt.touches;
    lastTouchRef.current = {
      x1: t[0].clientX,
      y1: t[0].clientY,
      x2: t[1].clientX,
      y2: t[1].clientY,
    };
  };

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2 || !lastTouchRef.current) return;
    const prev = lastTouchRef.current;
    const t = e.evt.touches;
    const cur = {
      x1: t[0].clientX,
      y1: t[0].clientY,
      x2: t[1].clientX,
      y2: t[1].clientY,
    };

    const prevMidX = (prev.x1 + prev.x2) / 2;
    const prevMidY = (prev.y1 + prev.y2) / 2;
    const curMidX = (cur.x1 + cur.x2) / 2;
    const curMidY = (cur.y1 + cur.y2) / 2;
    const prevDist = Math.hypot(prev.x2 - prev.x1, prev.y2 - prev.y1);
    const curDist = Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1);

    const scale = prevDist > 1 ? curDist / prevDist : 1;
    const newZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, zoomRef.current * scale),
    );
    const ratio = newZoom / zoomRef.current;
    applyViewport(newZoom, {
      x: curMidX - (prevMidX - panRef.current.x) * ratio,
      y: curMidY - (prevMidY - panRef.current.y) * ratio,
    });
    lastTouchRef.current = cur;
  };

  const handleTouchEnd = () => {
    lastTouchRef.current = null;
    const stage = stageRef.current;
    if (!stage) return;
    const snapped = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.round(zoomRef.current * 10) / 10),
    );
    if (snapped !== zoomRef.current) {
      const vpCx = -panRef.current.x / zoomRef.current + stage.width() / 2;
      const vpCy = -panRef.current.y / zoomRef.current + stage.height() / 2;
      applyViewport(snapped, {
        x: stage.width() / 2 - vpCx * snapped,
        y: stage.height() / 2 - vpCy * snapped,
      });
    }
  };

  // Expose applyViewport + raw layer canvas to parent via navRef (for minimap/zoom controls)
  useEffect(() => {
    if (!navRef) return;
    navRef.current = {
      applyViewport,
      getLayer: () => layerRef.current,
    };
    return () => {
      navRef.current = null;
    };
  }, [navRef, applyViewport]);

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
    const common = {
      key: stroke.id,
      id: stroke.id,
      listening: true,
      onDblClick: () => onDeleteStroke(stroke.id),
      ref: getRefCb(stroke),
    };
    switch (stroke.type) {
      case 'path':
        return (
          <Line
            {...common}
            points={data.points ?? []}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            lineCap='round'
            lineJoin='round'
            tension={0.5}
          />
        );
      case 'brush': {
        const sprayPoints = generateSprayPoints(
          data.points ?? [],
          data.strokeWidth ?? 6,
        );
        const dotSize = Math.max(1, Math.floor((data.strokeWidth ?? 6) / 6));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (
          <Shape
            {...common}
            fill={data.stroke}
            sceneFunc={brushSceneFunc}
            {...({ sprayPoints, dotSize, animT: 0 } as any)}
          />
        );
      }
      case 'eraser':
        return (
          <Line
            {...common}
            points={data.points ?? []}
            stroke='rgba(0,0,0,1)'
            strokeWidth={data.strokeWidth}
            lineCap='round'
            lineJoin='round'
            tension={0.5}
            globalCompositeOperation='destination-out'
          />
        );
      case 'rect':
        return (
          <Rect
            {...common}
            x={data.x}
            y={data.y}
            width={data.width}
            height={data.height}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            fill='transparent'
          />
        );
      case 'circle':
        return (
          <Ellipse
            {...common}
            x={data.x}
            y={data.y}
            radiusX={data.radiusX ?? 0}
            radiusY={data.radiusY ?? 0}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            fill='transparent'
          />
        );
      case 'line':
        return (
          <Line
            {...common}
            points={data.points ?? []}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            lineCap='round'
          />
        );
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
        return null;
    }
  };

  const renderRemoteLiveStroke = (uid: string, s: LiveStroke) => {
    if (s.points.length < 4) return null;
    const [x1, y1, x2, y2] = s.points;
    const k = `live-${uid}`;
    switch (s.type) {
      case 'path':
        return (
          <Line
            key={k}
            points={s.points}
            stroke={s.color}
            strokeWidth={s.strokeWidth}
            lineCap='round'
            lineJoin='round'
            tension={0.5}
            listening={false}
          />
        );
      case 'brush': {
        const sprayPoints = generateSprayPoints(s.points, s.strokeWidth);
        const dotSize = Math.max(1, Math.floor(s.strokeWidth / 6));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (
          <Shape
            key={k}
            fill={s.color}
            sceneFunc={brushSceneFunc}
            listening={false}
            {...({ sprayPoints, dotSize, animT: 0 } as any)}
          />
        );
      }
      case 'eraser':
        return (
          <Line
            key={k}
            points={s.points}
            stroke='rgba(0,0,0,1)'
            strokeWidth={s.strokeWidth}
            lineCap='round'
            lineJoin='round'
            tension={0.5}
            globalCompositeOperation='destination-out'
            listening={false}
          />
        );
      case 'rect':
        return (
          <Rect
            key={k}
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            stroke={s.color}
            strokeWidth={s.strokeWidth}
            fill='transparent'
            listening={false}
          />
        );
      case 'circle':
        return (
          <Ellipse
            key={k}
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2}
            radiusX={Math.abs(x2 - x1) / 2}
            radiusY={Math.abs(y2 - y1) / 2}
            stroke={s.color}
            strokeWidth={s.strokeWidth}
            fill='transparent'
            listening={false}
          />
        );
      case 'line':
        return (
          <Line
            key={k}
            points={[x1, y1, x2, y2]}
            stroke={s.color}
            strokeWidth={s.strokeWidth}
            lineCap='round'
            listening={false}
          />
        );
      default:
        return null;
    }
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

  const renderLiveStroke = () => {
    if (livePoints.length < 4) return null;
    const [x1, y1, x2, y2] = livePoints;
    switch (tool) {
      case 'pen':
        return (
          <Line
            ref={liveLineRef}
            points={livePoints}
            stroke={color}
            strokeWidth={strokeWidth}
            lineCap='round'
            lineJoin='round'
            tension={0.5}
            listening={false}
          />
        );
      case 'brush': {
        const sprayPoints = generateSprayPoints(livePoints, strokeWidth);
        const dotSize = Math.max(1, Math.floor(strokeWidth / 6));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (
          <Shape
            ref={liveShapeRef}
            fill={color}
            sceneFunc={brushSceneFunc}
            listening={false}
            {...({ sprayPoints, dotSize, animT: 0 } as any)}
          />
        );
      }
      case 'eraser':
        return (
          <Line
            points={livePoints}
            stroke='rgba(0,0,0,1)'
            strokeWidth={strokeWidth}
            lineCap='round'
            lineJoin='round'
            tension={0.5}
            globalCompositeOperation='destination-out'
            listening={false}
          />
        );
      case 'rect':
        return (
          <Rect
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            stroke={color}
            strokeWidth={strokeWidth}
            fill='transparent'
            listening={false}
          />
        );
      case 'circle':
        return (
          <Ellipse
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2}
            radiusX={Math.abs(x2 - x1) / 2}
            radiusY={Math.abs(y2 - y1) / 2}
            stroke={color}
            strokeWidth={strokeWidth}
            fill='transparent'
            listening={false}
          />
        );
      case 'line':
        return (
          <Line
            points={livePoints}
            stroke={color}
            strokeWidth={strokeWidth}
            lineCap='round'
            listening={false}
          />
        );
      case 'text':
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
      default:
        return null;
    }
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

interface TextBoxEditorProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  rotation: number;
  color: string;
  initial: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

function TextBoxEditor({
  x,
  y,
  width,
  height,
  fontSize,
  rotation,
  color,
  initial,
  onCommit,
  onCancel,
}: TextBoxEditorProps) {
  const [value, setValue] = useState(initial);
  // A textarea can't CSS-center its own text, so instead size the element to the
  // text (auto height) and CENTER THE ELEMENT inside the box. Its centre then
  // coincides with the box centre (same width/left, vertically centered), so the
  // text reads centered AND the rotate transform-origin stays on the box centre.
  const [top, setTop] = useState(y);
  const [taH, setTaH] = useState(height);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  const recenter = () => {
    const el = ref.current;
    if (!el) return;
    // Collapse to 0 (NOT 'auto', which clamps to the rows attribute -> over-measures
    // short boxes) so scrollHeight is the true unclamped content height. With CSS
    // line-height:1 that equals lines × fontSize — same metric Konva verticalAlign
    // uses — so centering is accurate at any box height and matches the committed text.
    el.style.height = '0px';
    const contentH = el.scrollHeight;
    // Restore height & top imperatively BEFORE calling setState. If contentH is
    // unchanged, React bails on the setState (same value → no re-render) and
    // never re-applies the inline style, leaving height stuck at 0px / text
    // invisible. Writing the correct values back to the DOM in the same
    // synchronous call guarantees the element is always sized correctly,
    // regardless of whether React re-renders. The browser won't paint between
    // synchronous JS statements, so there is no visual flash. setState still
    // runs to keep React state in sync for the next render.
    const newTop = y + (height - contentH) / 2 + fontSize * EDITOR_NUDGE_Y;
    el.style.height = contentH + 'px';
    el.style.top = Math.round(newTop) + 'px';
    setTaH(contentH);
    setTop(newTop);
  };

  // useLayoutEffect (not useEffect): measure + center BEFORE the browser paints, so
  // the editor never flashes at the top-left/full-height initial position for a frame.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    recenter();
  }, []);

  // Recompute when the box moves/resizes via the handles (width reflows the text;
  // y/height move the vertical centre) so the editor tracks the outline live.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    recenter();
  }, [x, y, width, height, fontSize]);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      className='text-tool-textarea'
      style={{
        // Integer left/top: sub-pixel positions get resampled (blurry text). Round so
        // the glyphs land on the pixel grid.
        left: Math.round(x + fontSize * EDITOR_NUDGE_X),
        top: Math.round(top),
        width,
        height: taH,
        fontSize,
        color,
        caretColor: color,
        // Keep the transform unconditionally: it gives the textarea its own layer so it
        // paints above the Konva canvas (without it the edited text fell behind the
        // canvas and "disappeared"). rotate(0deg) is harmless for unrotated boxes.
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        recenter();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      placeholder='Type here…'
    />
  );
}
