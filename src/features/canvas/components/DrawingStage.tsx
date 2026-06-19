import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stroke, StrokeData, ToolType } from '../../../lib/types';
import {
  buildStrokeData,
  MIN_TEXT_WIDTH,
  MIN_TEXT_HEIGHT,
} from '../utils/strokeSerializer';
import {
  textAABB,
  aabbOverlap,
  type Box,
  type AABB,
} from '../utils/textBoxGeometry';
import {
  renderShape,
  descriptorFromStroke,
  descriptorFromLive,
  type SimpleStrokeType,
} from '../render/strokeShapes';
import { TextBoxNode } from './TextBoxNode';
import { BoxControls } from './BoxControls';
import { MultiSelectOverlay } from './MultiSelectOverlay';
import { TextBoxEditor } from './TextBoxEditor';
import type { ActiveBox, XformBox } from './textBoxTypes';
import { useViewport } from '../hooks/useViewport';
import { cursorForTool } from '../utils/cursorForTool';
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
  const [active, setActive] = useState<ActiveBox | null>(null);
  // Transient geometry while resizing a box in a MULTI-selection — overrides the
  // box's stored geometry so it reflows live. Cleared once the persisted stroke
  // catches up (see reconcile effect below). Single-box transforms write `active`.
  const [xform, setXform] = useState<XformBox | null>(null);
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
      // If a box is mid-edit, this is a "click away to finish": let the textarea's
      // blur commit the text instead of starting a new box. Starting a draw here
      // would leak past the blur's onToolChange('select') and commit a phantom
      // empty-data 'select' stroke on mouseup (see handleMouseUp guard below).
      if (active?.editing) return;
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
    // Only real drawing tools commit here. If the tool flipped to a non-drawing
    // tool mid-gesture (e.g. a text edit's blur switched us to 'select' between
    // mousedown and mouseup), bail — committing would serialize empty data.
    const isDrawingTool =
      tool === 'pen' ||
      tool === 'brush' ||
      tool === 'eraser' ||
      tool === 'rect' ||
      tool === 'circle' ||
      tool === 'line';
    if (!isDrawing.current || points.length < 4 || !isDrawingTool) {
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
    if (stroke.type === 'text') {
      return (
        <TextBoxNode
          key={stroke.id}
          stroke={stroke}
          tool={tool}
          zoom={zoom}
          active={active}
          xform={xform}
          multiIds={multiIds}
          multiOffset={multiOffset}
          stageRef={stageRef}
          handleStartRef={handleStartRef}
          getRefCb={getRefCb}
          setActive={setActive}
          selectStroke={selectStroke}
          openEditExisting={openEditExisting}
          onUpdateStroke={onUpdateStroke}
        />
      );
    }
    return renderShape(
      stroke.type as SimpleStrokeType,
      descriptorFromStroke(stroke.data),
      {
        key: stroke.id,
        id: stroke.id,
        listening: true,
        ref: getRefCb(stroke),
        onDblClick: () => onDeleteStroke(stroke.id),
      },
    );
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

  const cursor = cursorForTool(tool, disabled);

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
                stroke yet, so it has no draggable Group of its own — render the same
                BoxControls a committed box draws (see TextBoxNode), in a Group transformed
                exactly like the box. Handles write `active`; persist is a no-op until the
                text commits. */}
            {active && active.id === null && (
              <Group
                x={active.x + active.width / 2}
                y={active.y + active.height / 2}
                offsetX={active.width / 2}
                offsetY={active.height / 2}
                rotation={active.rotation}
              >
                <BoxControls
                  w={active.width}
                  h={active.height}
                  zoom={zoom}
                  editing={active.editing}
                  stageRef={stageRef}
                  handleStartRef={handleStartRef}
                  geom={active}
                  onChange={(p) =>
                    setActive((prev) => (prev ? { ...prev, ...p } : prev))
                  }
                  onCommit={() => {
                    if (active.id)
                      onUpdateStroke?.(active.id, {
                        x: active.x,
                        y: active.y,
                        width: active.width,
                        height: active.height,
                        rotation: active.rotation,
                      });
                  }}
                />
              </Group>
            )}
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
            {multiIds.length > 1 && multiRect && (
              <MultiSelectOverlay
                multiIds={multiIds}
                multiRect={multiRect}
                multiOffset={multiOffset}
                xform={xform}
                strokes={strokes}
                zoom={zoom}
                stageRef={stageRef}
                handleStartRef={handleStartRef}
                multiDragStart={multiDragStart}
                setMultiOffset={setMultiOffset}
                setMultiRect={setMultiRect}
                setXform={setXform}
                clearSelection={clearSelection}
                onUpdateStroke={onUpdateStroke}
              />
            )}
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
