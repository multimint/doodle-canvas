import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stroke, StrokeData, ToolType, TextFocus } from '../../../lib/types';
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
import { rectToPerimeter, ellipseToPerimeter } from '../utils/wiggleUtils';
import { WiggleFilters } from './WiggleFilters';
import { RemoteTextFocus } from './RemoteTextFocus';
import { TextBoxNode } from './TextBoxNode';
import { BoxControls } from './BoxControls';
import { MultiSelectOverlay } from './MultiSelectOverlay';
import { TextBoxEditor } from './TextBoxEditor';
import type { ActiveBox, XformBox } from './textBoxTypes';
import { useViewport } from '../hooks/useViewport';
import { cursorForTool } from '../utils/cursorForTool';
import { usesToolCursor } from '../utils/toolCursor';
import { ToolCursor } from './ToolCursor';
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
  onResizeStroke?: (dir: 1 | -1) => void;
  onViewportChange?: (zoom: number, pan: { x: number; y: number }) => void;
  stageRef: React.RefObject<Konva.Stage>;
  navRef?: React.MutableRefObject<NavHandle | null>;
  overlay?: React.ReactNode;
  remoteStrokes?: Record<string, LiveStroke>;
  onLiveUpdate?: (stroke: LiveStroke | null) => void;
  wiggle?: boolean;
  // Friends' live Text Box focus (keyed by uid): which box they're on, editing flag, live text.
  remoteTextFocus?: Record<string, TextFocus>;
  // Report THIS client's Text Box focus so friends can see it (boxId null = no box / cleared).
  onTextFocus?: (boxId: string | null, editing: boolean, text?: string) => void;
  displayNames?: Record<string, string>;
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
  onResizeStroke,
  onViewportChange,
  stageRef,
  navRef,
  overlay,
  remoteStrokes,
  onLiveUpdate,
  wiggle = true,
  remoteTextFocus,
  onTextFocus,
  displayNames,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<Konva.Layer>(null);
  // Markers render on their own layer behind the main one. The eraser uses destination-out
  // compositing, which only affects its own layer's canvas — so markers stay behind every
  // other stroke AND are never erased ("in front of" the eraser).
  const bgLayerRef = useRef<Konva.Layer>(null);
  const liveLineRef = useRef<Konva.Line | null>(null);
  const liveShapeRef = useRef<Konva.Shape | null>(null);
  // The live line's clean (un-jittered) points, captured each render in renderLiveStroke and
  // handed to the wiggle hook so its boil rebuilds from the source geometry rather than from
  // node.points() (which it has already overwritten with a jittered variant).
  const liveBaseRef = useRef<number[]>([]);

  // Size/area-aware follower cursor. Positioned imperatively (see handleMouseMove) so it
  // tracks the pointer without re-rendering. Only shown for fine pointers (mouse); touch
  // has no hover, so a follower would stick at the last touch point.
  const toolCursorRef = useRef<HTMLDivElement>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [isFinePointer] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: fine)').matches,
  );

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

  const {
    registerStroke,
    unregisterStroke,
    registerLive,
    unregisterLive,
    setFrozenText,
  } = useWiggle(layerRef, wiggle);

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

  // Right-click drops the active tool back to Select (idle) so a tool can be dismissed
  // without reaching for the toolbar. Always suppress the browser context menu over the
  // canvas; when already idle there's nothing to deselect.
  const handleContextMenu = (e: KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    if (tool !== 'select') {
      cancelStroke(); // abandon any in-progress stroke started by the press
      onToolChange?.('select');
    }
  };

  // The wheel zooms only when panning/idle (hand or select). With a drawing tool active it
  // resizes the stroke instead — scroll up = bigger, down = smaller.
  const handleWheelOrResize = (e: KonvaEventObject<WheelEvent>) => {
    if (tool === 'hand' || tool === 'select') {
      handleWheel(e);
      return;
    }
    e.evt.preventDefault();
    onResizeStroke?.(e.evt.deltaY < 0 ? 1 : -1);
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // Only the left button draws/selects/pans. Right (and middle) clicks must have no
    // side effect here — right-click is handled by onContextMenu, which just cancels the
    // active tool. Without this guard a right-press starts a pen stroke or text box.
    if (e.evt.button !== 0) return;
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
      // Broadcast the cursor so friends still see the hand tool (and its pointer) even while
      // panning — otherwise the hand tool emits nothing and the remote cursor disappears.
      const p = getPos();
      onMouseMove(p.x, p.y);
      if (!isPanning.current) return;
      const dx = e.evt.clientX - lastClientPos.current.x;
      const dy = e.evt.clientY - lastClientPos.current.y;
      lastClientPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      panBy(dx, dy);
      return;
    }

    const { x, y } = getPos();
    onMouseMove(x, y);

    // Follow the pointer with the tool-footprint cursor. Write the screen-space position
    // straight to the node (same x*zoom+pan transform CursorOverlay uses) so hovering and
    // drawing both update it without a React re-render; reveal it on the first move.
    if (isFinePointer && !disabled && usesToolCursor(tool)) {
      const el = toolCursorRef.current;
      if (el) {
        el.style.transform = `translate(${x * zoom + pan.x}px, ${y * zoom + pan.y}px)`;
        if (!cursorVisible) setCursorVisible(true);
      }
    }

    if (isMarquee.current && marqueeRef.current) {
      marqueeRef.current = { ...marqueeRef.current, x1: x, y1: y };
      setMarquee(marqueeRef.current);
      return;
    }

    if (!isDrawing.current) return;

    let newPoints: number[];
    if (
      tool === 'pen' ||
      tool === 'brush' ||
      tool === 'marker' ||
      tool === 'eraser'
    ) {
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
        initial: 'Text', // pre-fill + select so a plain click drops a ready "Text" box
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
      tool === 'marker' ||
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
        // Empty text: keep the box and save the empty string (don't delete). TextBoxNode
        // renders a faint placeholder for empty boxes so they stay visible and selectable
        // — a bare empty Konva <Text> draws nothing and has no hit area, i.e. would be lost.
        onUpdateStroke?.(active.id, { text: '' });
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

  // Hide the follower across tool changes so it never flashes at the stage origin before
  // the first mousemove repositions it. The next move over the canvas reveals it again.
  useEffect(() => {
    setCursorVisible(false);
  }, [tool]);

  // Text Boxes boil only while idle: freeze the selected/edited box(es) so their handles
  // and the editor textarea stay aligned with stationary glyphs. A brand-new box
  // (active.id === null) has no committed node yet, so there's nothing to freeze.
  useEffect(() => {
    const ids: string[] = [];
    if (active?.id) ids.push(active.id);
    if (multiIds.length) ids.push(...multiIds);
    setFrozenText(ids);
  }, [active?.id, multiIds, setFrozenText]);

  // Broadcast which committed Text Box we have selected / are editing so friends see the
  // outline. Selection + mode changes go out here; live keystrokes stream via the editor's
  // onChange. A brand-new box (id === null) has no shared id yet, so it reports as "no box".
  useEffect(() => {
    onTextFocus?.(active?.id ?? null, !!active?.editing);
  }, [active?.id, active?.editing, onTextFocus]);

  // Friends' in-progress text keyed by the box they're editing (feeds TextBoxNode so their
  // typing shows live), and the flat list of focuses to outline.
  const remoteEditText = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of Object.values(remoteTextFocus ?? {})) {
      if (f.editing && f.text != null) m[f.boxId] = f.text;
    }
    return m;
  }, [remoteTextFocus]);
  const remoteFocusList = useMemo(
    () =>
      Object.entries(remoteTextFocus ?? {}).map(([uid, focus]) => ({ uid, focus })),
    [remoteTextFocus],
  );

  // While editing a Text Box, the editor textarea covers the canvas, so the stage stops
  // firing mousemove and our cursor would freeze/vanish for friends. Track the pointer on the
  // window instead and keep emitting our canvas-space position so our cursor stays live.
  useEffect(() => {
    if (!active?.editing) return;
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      onMouseMove((e.clientX - rect.left - pan.x) / zoom, (e.clientY - rect.top - pan.y) / zoom);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [active?.editing, pan.x, pan.y, zoom, onMouseMove]);

  // Konva measures/caches text with whatever font is available at draw time. If a Text
  // Box mounts before the doodle font (Patrick Hand) has loaded it renders in the
  // fallback and stays there until something redraws — so force one redraw once fonts
  // are ready to recompute its wrapping/metrics in the real font.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) layerRef.current?.batchDraw();
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          remoteText={remoteEditText[stroke.id]}
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
    // The eraser is never boiled — a wiggling hole exposes the spray/strokes underneath
    // (dots appear to jump into the erased area). It still renders + erases, just statically.
    if (livePoints.length >= 4 && tool !== 'eraser') {
      // brush is a sceneFunc Shape (animT boil); every other drawable tool is a Line
      // whose points are swapped per frame.
      if (tool === 'brush') {
        const node = liveShapeRef.current;
        if (node) registerLive(node, true);
      } else {
        const node = liveLineRef.current;
        if (node) registerLive(node, false, liveBaseRef);
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
      tool !== 'marker' &&
      tool !== 'eraser' &&
      tool !== 'rect' &&
      tool !== 'circle' &&
      tool !== 'line'
    ) {
      return null; // hand / select don't draw
    }
    const type: SimpleStrokeType = tool === 'pen' ? 'path' : tool;
    const desc = descriptorFromLive({ type, points: livePoints, color, strokeWidth });
    // Capture the exact points renderShape will assign to the node — rect/circle trace
    // their outline, every other line uses its raw points — so the wiggle hook boils from
    // this clean geometry instead of reading back the jittered node.
    liveBaseRef.current =
      type === 'rect'
        ? rectToPerimeter(desc.x, desc.y, desc.width, desc.height)
        : type === 'circle'
          ? ellipseToPerimeter(desc.x, desc.y, desc.radiusX, desc.radiusY)
          : desc.points;
    return renderShape(
      type,
      desc,
      {
        listening: false,
        // brush is the only sceneFunc Shape; every other drawable tool is a Line, so its
        // live node goes to liveLineCb to be boiled via points-swap.
        ref: tool === 'brush' ? liveShapeCb : liveLineCb,
      },
    );
  };

  // Eraser masks for the marker layer. The eraser's destination-out only cuts the canvas of
  // the layer it's drawn on, so the copy on the main layer can't reach markers (they live on
  // their own background layer). Re-drawing each eraser stroke here — after the markers — lets
  // the same cut fall on the marker canvas too. These are static (no wiggle ref/listening):
  // the boiling copy on the main layer owns the registry entry, and an unseen mask needn't boil.
  const renderEraserLiveMask = () => {
    if (tool !== 'eraser' || livePoints.length < 4) return null;
    return renderShape(
      'eraser',
      descriptorFromLive({ type: 'eraser', points: livePoints, color, strokeWidth }),
      { listening: false },
    );
  };

  // Hide the native cursor only while the follower is actually on screen, so they never
  // double up — and, crucially, so the pointer isn't left invisible in the gap between a
  // tool change (which hides the follower) and the next mousemove that re-reveals it. In
  // that gap the normal native cursor shows.
  const showToolCursor = isFinePointer && !disabled && usesToolCursor(tool);
  const cursor =
    showToolCursor && cursorVisible ? 'none' : cursorForTool(tool, disabled);

  return (
    <div
      className='stage-container'
      ref={containerRef}
      style={{ position: 'relative' }}
    >
      {/* Hidden SVG displacement filters that the Text Box boil warps glyph outlines through. */}
      <WiggleFilters />
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
          onContextMenu={handleContextMenu}
          onMouseLeave={() => {
            handleMouseUp();
            // While editing a box, the pointer leaving the stage usually just means it moved
            // onto the editor textarea — keep our cursor alive (the window listener below keeps
            // emitting) so friends still see us. Otherwise clear it at the canvas edge.
            if (!active?.editing) onMouseLeave();
            setCursorVisible(false); // don't freeze the follower at the canvas edge
          }}
          onWheel={handleWheelOrResize}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor }}
        >
          {/* Background layer: markers + eraser masks, interleaved in chronological
              (timestamp-sorted) order. Sits behind the main layer so markers are always
              behind everything. The eraser strokes are re-drawn here so their destination-out
              cuts the marker canvas too — without this copy, markers on their own layer could
              never be erased. Order matters: destination-out only cuts what's already painted,
              so an eraser clears markers drawn BEFORE it, while a marker drawn AFTER paints
              over the hole and survives (a newer marker replaces an older erase). */}
          <Layer ref={bgLayerRef}>
            {strokes
              .filter((s) => s.type === 'marker' || s.type === 'eraser')
              .map((s) =>
                s.type === 'marker'
                  ? renderStroke(s)
                  : renderShape('eraser', descriptorFromStroke(s.data), {
                      key: `erase-mask-${s.id}`,
                      listening: false,
                    }),
              )}
            {/* Live stroke is the newest, so it goes last. Tools are mutually exclusive, so
                at most one of these renders. */}
            {!disabled && tool === 'marker' && renderLiveStroke()}
            {!disabled && renderEraserLiveMask()}
          </Layer>
          <Layer ref={layerRef}>
            {strokes.filter((s) => s.type !== 'marker').map(renderStroke)}
            {remoteStrokes &&
              Object.entries(remoteStrokes).map(([uid, s]) =>
                renderRemoteLiveStroke(uid, s),
              )}
            {!disabled && tool !== 'marker' && renderLiveStroke()}
            {/* Friends' live Text Box focus: coloured outline + name for the box each is
                selecting/editing (their live text is mirrored via TextBoxNode above). */}
            <RemoteTextFocus
              focuses={remoteFocusList}
              strokes={strokes}
              displayNames={displayNames ?? {}}
              zoom={zoom}
            />
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
          selectAllOnFocus={active.id === null}
          onCommit={handleEditingCommit}
          onCancel={() => setActive(null)}
          onChange={(t) => {
            if (active.id) onTextFocus?.(active.id, true, t);
          }}
        />
      )}

      {showToolCursor && (
        <ToolCursor
          ref={toolCursorRef}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          zoom={zoom}
          visible={cursorVisible}
        />
      )}

      {overlay}
    </div>
  );
}
