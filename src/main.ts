import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  FederatedPointerEvent,
} from "pixi.js";
import { nodes, type WordNode } from "./data";

const STYLES = {
  background: 0x0b0616,
  nodeFill: 0x140b22,
  nodeStroke: 0x9ee7ff,
  nodeAccent: 0xff5ad6,
  edge: 0x7b3cff,
  edgeHighlight: 0x55f0ff,
  textPrimary: 0x0b0616,
  textSecondary: 0x35224a,
};

const EDGE_SEGMENTS = 14;
const CARD_WIDTH = 150;
const CARD_HEIGHT = 90;
const CARD_RADIUS = 16;
const CONNECTOR_RADIUS = 6;
const CONNECTOR_OFFSET = 2;
const DEPTH_COLORS = [
  0xff4fd8,
  0x7c4dff,
  0x33f0ff,
  0x00ffa3,
  0xffb347,
  0xff6b6b,
];

type LayoutNode = WordNode & { children: number[] };

type Position = {
  x: number;
  y: number;
};


const containerEl = document.querySelector<HTMLDivElement>("#stage");
if (!containerEl) {
  throw new Error("Missing #stage container");
}


(async () => {
  const app = new Application();
  await app.init({
    resizeTo: containerEl,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  containerEl.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const { layout: fullLayout, roots } = buildLayout(nodes);
  let positions = new Map<number, Position>();
  let treeSize = { width: 1, height: 1 };
  const collapsed = new Set<number>();
  let currentLayout = new Map<number, LayoutNode>();
  let depthMap = new Map<number, number>();
  let animating = false;
  let enteringActive: Set<number> = new Set();
  let selectedNodeId: number | null = null;

  const edgeLayer = new Graphics();
  const animEdgeLayer = new Graphics();
  const nodeLayer = new Container();
  const exitLayer = new Container();
  const highlightLayer = new Graphics();

  world.addChild(edgeLayer, animEdgeLayer, highlightLayer, nodeLayer, exitLayer);

  const nodeViews = new Map<number, Graphics>();
  const labelViews = new Map<number, Text>();
  const nodeContainers = new Map<number, Container>();
  const parentMap = new Map<number, number>();

  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let worldStart = { x: 0, y: 0 };
  let draggingNodeId: number | null = null;
  let dragOffset = { x: 0, y: 0 };
  let dragMoved = false;
  let clickCandidateId: number | null = null;

  const padding = 120;


    // --- Move all dependent functions inside ---

    function renderEdges(layout: Map<number, LayoutNode>, positions: Map<number, Position>) {
      edgeLayer.clear();
      for (const node of layout.values()) {
        const start = positions.get(node.id);
        if (!start) continue;
        for (const childId of node.children) {
          if (enteringActive.has(childId)) continue;
          const end = positions.get(childId);
          if (!end) continue;
          const from = getConnector(start, "bottom");
          const to = getConnector(end, "top");
          const midY = (from.y + to.y) / 2;
          const fromDepth = depthMap.get(node.id) ?? 0;
          const toDepth = depthMap.get(childId) ?? fromDepth + 1;
          const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
          const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
          drawGradientBezier(
            edgeLayer,
            from,
            { x: from.x, y: midY },
            { x: to.x, y: midY },
            to,
            fromColor,
            toColor,
            4,
            1
          );
        }
      }
    }

    function renderNodes(layout: Map<number, LayoutNode>, positions: Map<number, Position>) {
      const labelStyle = new TextStyle({
        fill: STYLES.textPrimary,
        fontFamily: "Fraunces",
        fontSize: 20,
        fontWeight: "600",
      });

      const subLabelStyle = new TextStyle({
        fill: STYLES.textSecondary,
        fontFamily: "Work Sans",
        fontSize: 13,
        fontWeight: "500",
      });

      for (const node of layout.values()) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        const depth = depthMap.get(node.id) ?? 0;
        const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
        const fillColor = mixColor(baseColor, 0xffffff, 0.7);

        const container = new Container();
        container.position.set(pos.x, pos.y);
        container.alpha = 1;
        container.scale.set(1);

        const card = new Graphics();
        card.lineStyle(2.5, baseColor, 1);
        card.beginFill(fillColor, 1);
        card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
        card.endFill();

        const topConnector = new Graphics();
        topConnector.beginFill(STYLES.nodeStroke, 1);
        topConnector.drawCircle(0, -CARD_HEIGHT / 2 - CONNECTOR_OFFSET, CONNECTOR_RADIUS);
        topConnector.endFill();

        const bottomConnector = new Graphics();
        bottomConnector.beginFill(STYLES.nodeStroke, 1);
        bottomConnector.drawCircle(0, CARD_HEIGHT / 2 + CONNECTOR_OFFSET, CONNECTOR_RADIUS);
        bottomConnector.endFill();

        const label = new Text({ text: node.el, style: labelStyle });
        label.anchor.set(0.5, 0.5);
        label.position.set(0, -10);

        const subLabel = new Text({ text: node.ru, style: subLabelStyle });
        subLabel.anchor.set(0.5, 0.5);
        subLabel.position.set(0, 16);

        container.addChild(card, topConnector, bottomConnector, label, subLabel);
        const totalChildren = fullLayout.get(node.id)?.children.length ?? 0;
        container.eventMode = "static";
        container.cursor = totalChildren > 0 ? "pointer" : "default";
        container.on("pointerdown", (event: FederatedPointerEvent) => {
          event.stopPropagation();
          draggingNodeId = node.id;
          clickCandidateId = totalChildren > 0 ? node.id : null;
          const worldPoint = world.toLocal(event.global);
          dragStart = { x: worldPoint.x, y: worldPoint.y };
          dragOffset = {
            x: container.position.x - worldPoint.x,
            y: container.position.y - worldPoint.y,
          };
          dragMoved = false;
        });
        container.on("pointertap", () => {
          if (!dragMoved) {
            selectedNodeId = node.id;
            highlightPath(node.id);
          }
        });
        container.on("pointerup", (event: FederatedPointerEvent) => {
          event.stopPropagation();
          if (draggingNodeId !== null) {
            endNodeDrag();
          }
        });
        container.on("pointerupoutside", (event: FederatedPointerEvent) => {
          event.stopPropagation();
          if (draggingNodeId !== null) {
            endNodeDrag();
          }
        });

        nodeLayer.addChild(container);
        nodeViews.set(node.id, card);
        labelViews.set(node.id, label);
        nodeContainers.set(node.id, container);
      }
    }

    function endNodeDrag() {
      draggingNodeId = null;
      if (clickCandidateId !== null && !dragMoved) {
        selectedNodeId = clickCandidateId;
        highlightPath(clickCandidateId);
        toggleCollapse(clickCandidateId);
      }
      clickCandidateId = null;
      dragMoved = false;
    }

    function renderAll() {
      const prevIds = new Set(nodeContainers.keys());
      const prevPositions = new Map(positions);
      const visibleLayout = buildVisibleLayout();
      currentLayout = visibleLayout;
      depthMap = computeDepths(currentLayout, roots);
      const layoutInfo = layoutTree(visibleLayout, roots);
      const targetPositions = layoutInfo.positions;
      treeSize = {
        width: Math.max(1, layoutInfo.width),
        height: Math.max(1, layoutInfo.height),
      };

      const nextIds = new Set(visibleLayout.keys());
      const entering: number[] = [];
      const exiting: Container[] = [];
      for (const id of prevIds) {
        if (!nextIds.has(id)) {
          const container = nodeContainers.get(id);
          if (container) {
            nodeLayer.removeChild(container);
            exitLayer.addChild(container);
            exiting.push(container);
          }
        }
      }
      for (const id of nextIds) {
        if (!prevIds.has(id)) {
          entering.push(id);
        }
      }
      positions = targetPositions;

      edgeLayer.clear();
      animEdgeLayer.clear();
      highlightLayer.clear();
      nodeLayer.removeChildren();
      nodeViews.clear();
      labelViews.clear();
      nodeContainers.clear();
      parentMap.clear();

      for (const node of visibleLayout.values()) {
        for (const child of node.children) {
          if (!parentMap.has(child)) {
            parentMap.set(child, node.id);
          }
        }
      }

      if (entering.length > 0) {
        enteringActive = new Set(entering);
      } else {
        enteringActive = new Set();
      }
      renderEdges(visibleLayout, positions);
      renderNodes(visibleLayout, positions);
      if (prevIds.size === 0) {
        fitToScreen(padding);
      }
      if (selectedNodeId !== null) {
        highlightPath(selectedNodeId);
      }
      if (entering.length > 0) {
        animateIn(entering, targetPositions);
      }
      if (exiting.length > 0) {
        animateOut(exiting);
      }
    }

    function buildVisibleLayout() {
      const visible = new Map<number, LayoutNode>();
      for (const node of fullLayout.values()) {
        const children = collapsed.has(node.id) ? [] : node.children;
        const next = { ...node, children: [...children] };
        visible.set(node.id, next);
      }
      return visible;
    }

    function toggleCollapse(id: number) {
      if (collapsed.has(id)) {
        collapsed.delete(id);
        const node = fullLayout.get(id);
        if (node) {
          for (const child of node.children) {
            collapsed.add(child);
          }
        }
      } else {
        collapsed.add(id);
      }
      renderAll();
    }

    function computeDepths(layout: Map<number, LayoutNode>, roots: number[]) {
      const depths = new Map<number, number>();
      const queue: Array<{ id: number; depth: number }> = roots.map((id) => ({
        id,
        depth: 0,
      }));

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        if (depths.has(current.id)) continue;
        depths.set(current.id, current.depth);
        const node = layout.get(current.id);
        if (!node) continue;
        for (const child of node.children) {
          if (!depths.has(child)) {
            queue.push({ id: child, depth: current.depth + 1 });
          }
        }
      }

      return depths;
    }

    function highlightPath(targetId: number) {
      for (const [id, card] of nodeViews.entries()) {
        const depth = depthMap.get(id) ?? 0;
        const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
        const fillColor = mixColor(baseColor, 0xffffff, 0.7);
        card.clear();
        card.lineStyle(2.5, baseColor, 1);
        card.beginFill(fillColor, 1);
        card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
        card.endFill();
      }

      highlightLayer.clear();

      let current = targetId;
      while (parentMap.has(current)) {
        const parent = parentMap.get(current);
        if (parent === undefined) break;
        const from = positions.get(parent);
        const to = positions.get(current);
        if (from && to) {
          const fromPoint = getConnector(from, "bottom");
          const toPoint = getConnector(to, "top");
          const midY = (fromPoint.y + toPoint.y) / 2;
          const fromDepth = depthMap.get(parent) ?? 0;
          const toDepth = depthMap.get(current) ?? fromDepth + 1;
          const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
          const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
          drawGradientBezier(
            highlightLayer,
            fromPoint,
            { x: fromPoint.x, y: midY },
            { x: toPoint.x, y: midY },
            toPoint,
            fromColor,
            toColor,
            4,
            1
          );
        }
        current = parent;
      }

      let highlight = targetId;
      while (highlight !== undefined) {
        const card = nodeViews.get(highlight);
        if (card) {
          const depth = depthMap.get(highlight) ?? 0;
          const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
          const fillColor = mixColor(baseColor, 0xffffff, 0.7);
          card.clear();
          card.lineStyle(2.5, baseColor, 1);
          card.beginFill(fillColor, 1);
          card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
          card.endFill();
        }
        const parent = parentMap.get(highlight);
        if (parent === undefined) break;
        highlight = parent;
      }
    }

    function animateIn(order: number[], positions: Map<number, Position>) {
      if (animating) return;
      animating = true;
      const start = performance.now();
      const duration = 420;
      const stagger = 20;

      for (const id of order) {
        const container = nodeContainers.get(id);
        if (!container) continue;
        const target = positions.get(id);
        if (!target) continue;
        const parentId = parentMap.get(id);
        if (parentId === undefined) {
          container.position.set(target.x, target.y);
          container.alpha = 1;
          container.scale.set(1);
          continue;
        }
        if (container) {
          container.alpha = 0;
          container.scale.set(0.5);
        }
      }

      app.ticker.add(function tick() {
        const now = performance.now();
        const elapsed = now - start;
        let done = true;

        animEdgeLayer.clear();
        for (let i = 0; i < order.length; i += 1) {
          const id = order[i];
          const container = nodeContainers.get(id);
          const target = positions.get(id);
          if (!container || !target) continue;
          const localStart = elapsed - i * stagger;
          if (localStart < 0) {
            done = false;
            continue;
          }
          const t = clamp(localStart / duration, 0, 1);
          const eased = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
          container.alpha = eased;
          const scale = 0.5 + 0.5 * eased;
          container.scale.set(scale);
          if (t < 1) done = false;

          const parentId = parentMap.get(id);
          if (parentId !== undefined) {
            const parentPos = positions.get(parentId);
            if (parentPos) {
              const fromPoint = getConnector(parentPos, "bottom");
              const toPoint = getConnector(target, "top");
              const midY = (fromPoint.y + toPoint.y) / 2;
              const fromDepth = depthMap.get(parentId) ?? 0;
              const toDepth = depthMap.get(id) ?? fromDepth + 1;
              const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
              const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
              const p0 = fromPoint;
              const p1 = { x: fromPoint.x, y: midY };
              const p2 = { x: toPoint.x, y: midY };
              const p3 = toPoint;
              drawGradientBezierPartial(
                animEdgeLayer,
                p0,
                p1,
                p2,
                p3,
                fromColor,
                toColor,
                eased,
                4,
                1
              );
              const tip = bezierPoint(p0, p1, p2, p3, eased);
              const offset = CARD_HEIGHT / 2 + CONNECTOR_OFFSET;
              container.position.set(tip.x, tip.y + offset);
            } else {
              container.position.set(target.x, target.y);
            }
          } else {
            container.position.set(target.x, target.y);
          }

          if (t >= 1 && parentId !== undefined) {
            container.position.set(target.x, target.y);
          }
        }

        if (done) {
          app.ticker.remove(tick);
          animEdgeLayer.clear();
          animating = false;
          for (const id of order) {
            const container = nodeContainers.get(id);
            const target = positions.get(id);
            if (container && target) {
              container.position.set(target.x, target.y);
              container.alpha = 1;
              container.scale.set(1);
            }
          }
          if (enteringActive.size > 0) {
            enteringActive = new Set();
            renderEdges(currentLayout, positions);
          }
        }
      });
    }

    function animateOut(exiting: Container[]) {
      const start = performance.now();
      const duration = 260;

      app.ticker.add(function tick() {
        const now = performance.now();
        const t = clamp((now - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        for (const container of exiting) {
          container.alpha = 1 - eased;
          const scale = 0.7 + 0.3 * (1 - eased);
          container.scale.set(scale);
        }

        if (t >= 1) {
          for (const container of exiting) {
            exitLayer.removeChild(container);
          }
          app.ticker.remove(tick);
        }
      });
    }

    function fitToScreen(padding: number) {
      const width = containerEl.clientWidth;
      const height = containerEl.clientHeight;
      if (!width || !height) return;

      const scaleX = (width - padding) / treeSize.width;
      const scaleY = (height - padding) / treeSize.height;
      const scale = clamp(Math.min(scaleX, scaleY), 0.2, 3.5);

      world.scale.set(scale);
      world.position.set(
        (width - treeSize.width * scale) / 2,
        (height - treeSize.height * scale) / 2
      );
    }

    // --- END ---

  renderAll();

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
    if (draggingNodeId !== null) return;
    isDragging = true;
    dragStart = { x: event.global.x, y: event.global.y };
    worldStart = { x: world.x, y: world.y };
  });

  app.stage.on("pointerup", () => {
    isDragging = false;
    if (draggingNodeId !== null) {
      endNodeDrag();
    }
  });

  app.stage.on("pointerupoutside", () => {
    isDragging = false;
    if (draggingNodeId !== null) {
      endNodeDrag();
    }
  });

  app.stage.on("pointermove", (event: FederatedPointerEvent) => {
    if (draggingNodeId !== null) {
      const container = nodeContainers.get(draggingNodeId);
      if (!container) return;
      const worldPoint = world.toLocal(event.global);
      const nextX = worldPoint.x + dragOffset.x;
      const nextY = worldPoint.y + dragOffset.y;
      container.position.set(nextX, nextY);
      positions.set(draggingNodeId, { x: nextX, y: nextY });
      if (
        Math.abs(worldPoint.x - dragStart.x) > 6 ||
        Math.abs(worldPoint.y - dragStart.y) > 6
      ) {
        dragMoved = true;
      }
      renderEdges(currentLayout, positions);
      highlightLayer.clear();
      return;
    }
    if (!isDragging) return;
    const dx = event.global.x - dragStart.x;
    const dy = event.global.y - dragStart.y;
    world.position.set(worldStart.x + dx, worldStart.y + dy);
  });

  app.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      const zoom = direction > 0 ? 0.96 : 1.04;
      const newScale = clamp(world.scale.x * zoom, 0.2, 3.5);

      const rect = app.canvas.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const worldPos = {
        x: (pointer.x - world.x) / world.scale.x,
        y: (pointer.y - world.y) / world.scale.y,
      };

      world.scale.set(newScale);
      world.position.set(
        pointer.x - worldPos.x * newScale,
        pointer.y - worldPos.y * newScale
      );
    },
    { passive: false }
  );

  window.addEventListener("resize", () => fitToScreen(padding));

})();

function buildLayout(data: WordNode[]) {
  const layout = new Map<number, LayoutNode>();
  const roots: number[] = [];

  const visit = (node: WordNode, parentId?: number) => {
    if (!layout.has(node.id)) {
      layout.set(node.id, { ...node, children: node.a.map((child) => child.id) });
    }

    if (parentId === undefined) {
      roots.push(node.id);
    }

    for (const child of node.a) {
      visit(child, node.id);
    }
  };

  for (const node of data) {
    visit(node);
  }

  const children = new Set<number>();
  for (const node of layout.values()) {
    for (const childId of node.children) {
      children.add(childId);
    }
  }

  const inferredRoots = [...layout.values()]
    .filter((node) => !children.has(node.id))
    .map((node) => node.id);

  const finalRoots = roots.length > 0 ? roots : inferredRoots;
  if (finalRoots.length === 0 && data.length > 0) {
    finalRoots.push(data[0].id);
  }

  return { layout, roots: finalRoots };
}

function layoutTree(layout: Map<number, LayoutNode>, roots: number[]) {
  const positions = new Map<number, Position>();
  const spacingX = 240;
  const spacingY = 170;
  let nextX = 0;

  const placeNode = (id: number, depth: number): number => {
    const node = layout.get(id);
    if (!node) return 0;
    const children = node.children.filter((child) => layout.has(child));

    if (children.length === 0) {
      const x = nextX;
      nextX += 1;
      positions.set(id, { x, y: depth });
      return x;
    }

    const childXs = children.map((child) => placeNode(child, depth + 1));
    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    positions.set(id, { x, y: depth });
    return x;
  };

  for (const root of roots) {
    placeNode(root, 0);
    nextX += 1;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  }

  for (const [id, pos] of positions.entries()) {
    positions.set(id, {
      x: (pos.x - minX) * spacingX,
      y: (pos.y - minY) * spacingY,
    });
  }

  return {
    positions,
    width: Math.max(1, (maxX - minX) * spacingX),
    height: Math.max(1, (maxY - minY) * spacingY),
  };
}

function renderEdges(layout: Map<number, LayoutNode>, positions: Map<number, Position>) {
  edgeLayer.clear();

  for (const node of layout.values()) {
    const start = positions.get(node.id);
    if (!start) continue;
    for (const childId of node.children) {
      if (enteringActive.has(childId)) continue;
      const end = positions.get(childId);
      if (!end) continue;
      const from = getConnector(start, "bottom");
      const to = getConnector(end, "top");
      const midY = (from.y + to.y) / 2;
      const fromDepth = depthMap.get(node.id) ?? 0;
      const toDepth = depthMap.get(childId) ?? fromDepth + 1;
      const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
      const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
      drawGradientBezier(
        edgeLayer,
        from,
        { x: from.x, y: midY },
        { x: to.x, y: midY },
        to,
        fromColor,
        toColor,
        4,
        1
      );
    }
  }
}

function renderNodes(layout: Map<number, LayoutNode>, positions: Map<number, Position>) {
  const labelStyle = new TextStyle({
    fill: STYLES.textPrimary,
    fontFamily: "Fraunces",
    fontSize: 20,
    fontWeight: "600",
  });

  const subLabelStyle = new TextStyle({
    fill: STYLES.textSecondary,
    fontFamily: "Work Sans",
    fontSize: 13,
    fontWeight: "500",
  });

  for (const node of layout.values()) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const depth = depthMap.get(node.id) ?? 0;
    const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
    const fillColor = mixColor(baseColor, 0xffffff, 0.7);

    const container = new Container();
    container.position.set(pos.x, pos.y);
    container.alpha = 1;
    container.scale.set(1);

    const card = new Graphics();
    card.lineStyle(2.5, baseColor, 1);
    card.beginFill(fillColor, 1);
    card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    card.endFill();

    const topConnector = new Graphics();
    topConnector.beginFill(STYLES.nodeStroke, 1);
    topConnector.drawCircle(0, -CARD_HEIGHT / 2 - CONNECTOR_OFFSET, CONNECTOR_RADIUS);
    topConnector.endFill();

    const bottomConnector = new Graphics();
    bottomConnector.beginFill(STYLES.nodeStroke, 1);
    bottomConnector.drawCircle(0, CARD_HEIGHT / 2 + CONNECTOR_OFFSET, CONNECTOR_RADIUS);
    bottomConnector.endFill();

    const label = new Text({ text: node.el, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, -10);

    const subLabel = new Text({ text: node.ru, style: subLabelStyle });
    subLabel.anchor.set(0.5, 0.5);
    subLabel.position.set(0, 16);

    container.addChild(card, topConnector, bottomConnector, label, subLabel);
    const totalChildren = fullLayout.get(node.id)?.children.length ?? 0;
    container.eventMode = "static";
    container.cursor = totalChildren > 0 ? "pointer" : "default";
    container.on("pointerdown", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      draggingNodeId = node.id;
      clickCandidateId = totalChildren > 0 ? node.id : null;
      const worldPoint = world.toLocal(event.global);
      dragStart = { x: worldPoint.x, y: worldPoint.y };
      dragOffset = {
        x: container.position.x - worldPoint.x,
        y: container.position.y - worldPoint.y,
      };
      dragMoved = false;
    });
    container.on("pointertap", () => {
      if (!dragMoved) {
        selectedNodeId = node.id;
        highlightPath(node.id);
      }
    });
    container.on("pointerup", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      if (draggingNodeId !== null) {
        endNodeDrag();
      }
    });
    container.on("pointerupoutside", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      if (draggingNodeId !== null) {
        endNodeDrag();
      }
    });

    nodeLayer.addChild(container);
    nodeViews.set(node.id, card);
    labelViews.set(node.id, label);
    nodeContainers.set(node.id, container);
  }
}

function endNodeDrag() {
  draggingNodeId = null;
  if (clickCandidateId !== null && !dragMoved) {
    selectedNodeId = clickCandidateId;
    highlightPath(clickCandidateId);
    toggleCollapse(clickCandidateId);
  }
  clickCandidateId = null;
  dragMoved = false;
}

function renderAll() {
  const prevIds = new Set(nodeContainers.keys());
  const prevPositions = new Map(positions);
  const visibleLayout = buildVisibleLayout();
  currentLayout = visibleLayout;
  depthMap = computeDepths(currentLayout, roots);
  const layoutInfo = layoutTree(visibleLayout, roots);
  const targetPositions = layoutInfo.positions;
  treeSize = {
    width: Math.max(1, layoutInfo.width),
    height: Math.max(1, layoutInfo.height),
  };

  const nextIds = new Set(visibleLayout.keys());
  const entering: number[] = [];
  const exiting: Container[] = [];
  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      const container = nodeContainers.get(id);
      if (container) {
        nodeLayer.removeChild(container);
        exitLayer.addChild(container);
        exiting.push(container);
      }
    }
  }
  for (const id of nextIds) {
    if (!prevIds.has(id)) {
      entering.push(id);
    }
  }
  positions = targetPositions;

  edgeLayer.clear();
  animEdgeLayer.clear();
  highlightLayer.clear();
  nodeLayer.removeChildren();
  nodeViews.clear();
  labelViews.clear();
  nodeContainers.clear();
  parentMap.clear();

  for (const node of visibleLayout.values()) {
    for (const child of node.children) {
      if (!parentMap.has(child)) {
        parentMap.set(child, node.id);
      }
    }
  }

  if (entering.length > 0) {
    enteringActive = new Set(entering);
  } else {
    enteringActive = new Set();
  }
  renderEdges(visibleLayout, positions);
  renderNodes(visibleLayout, positions);
  if (prevIds.size === 0) {
    fitToScreen(padding);
  }
  if (selectedNodeId !== null) {
    highlightPath(selectedNodeId);
  }
  if (entering.length > 0) {
    animateIn(entering, targetPositions);
  }
  if (exiting.length > 0) {
    animateOut(exiting);
  }
}

function buildVisibleLayout() {
  const visible = new Map<number, LayoutNode>();
  for (const node of fullLayout.values()) {
    const children = collapsed.has(node.id) ? [] : node.children;
    const next = { ...node, children: [...children] };
    visible.set(node.id, next);
  }
  return visible;
}

function toggleCollapse(id: number) {
  if (collapsed.has(id)) {
    collapsed.delete(id);
    const node = fullLayout.get(id);
    if (node) {
      for (const child of node.children) {
        collapsed.add(child);
      }
    }
  } else {
    collapsed.add(id);
  }
  renderAll();
}

function computeDepths(layout: Map<number, LayoutNode>, roots: number[]) {
  const depths = new Map<number, number>();
  const queue: Array<{ id: number; depth: number }> = roots.map((id) => ({
    id,
    depth: 0,
  }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (depths.has(current.id)) continue;
    depths.set(current.id, current.depth);
    const node = layout.get(current.id);
    if (!node) continue;
    for (const child of node.children) {
      if (!depths.has(child)) {
        queue.push({ id: child, depth: current.depth + 1 });
      }
    }
  }

  return depths;
}

function highlightPath(targetId: number) {
  for (const [id, card] of nodeViews.entries()) {
    const depth = depthMap.get(id) ?? 0;
    const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
    const fillColor = mixColor(baseColor, 0xffffff, 0.7);
    card.clear();
    card.lineStyle(2.5, baseColor, 1);
    card.beginFill(fillColor, 1);
    card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    card.endFill();
  }

  highlightLayer.clear();

  let current = targetId;
  while (parentMap.has(current)) {
    const parent = parentMap.get(current);
    if (parent === undefined) break;
    const from = positions.get(parent);
    const to = positions.get(current);
    if (from && to) {
      const fromPoint = getConnector(from, "bottom");
      const toPoint = getConnector(to, "top");
      const midY = (fromPoint.y + toPoint.y) / 2;
      const fromDepth = depthMap.get(parent) ?? 0;
      const toDepth = depthMap.get(current) ?? fromDepth + 1;
      const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
      const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
      drawGradientBezier(
        highlightLayer,
        fromPoint,
        { x: fromPoint.x, y: midY },
        { x: toPoint.x, y: midY },
        toPoint,
        fromColor,
        toColor,
        4,
        1
      );
    }
    current = parent;
  }

  let highlight = targetId;
  while (highlight !== undefined) {
    const card = nodeViews.get(highlight);
    if (card) {
      const depth = depthMap.get(highlight) ?? 0;
      const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
      const fillColor = mixColor(baseColor, 0xffffff, 0.7);
      card.clear();
      card.lineStyle(2.5, baseColor, 1);
      card.beginFill(fillColor, 1);
      card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      card.endFill();
    }
    const parent = parentMap.get(highlight);
    if (parent === undefined) break;
    highlight = parent;
  }
}

function animateIn(order: number[], positions: Map<number, Position>) {
  if (animating) return;
  animating = true;
  const start = performance.now();
  const duration = 420;
  const stagger = 20;

  for (const id of order) {
    const container = nodeContainers.get(id);
    if (!container) continue;
    const target = positions.get(id);
    if (!target) continue;
    const parentId = parentMap.get(id);
    if (parentId === undefined) {
      container.position.set(target.x, target.y);
      container.alpha = 1;
      container.scale.set(1);
      continue;
    }
    if (container) {
      container.alpha = 0;
      container.scale.set(0.5);
    }
  }

  app.ticker.add(function tick() {
    const now = performance.now();
    const elapsed = now - start;
    let done = true;

    animEdgeLayer.clear();
    for (let i = 0; i < order.length; i += 1) {
      const id = order[i];
      const container = nodeContainers.get(id);
      const target = positions.get(id);
      if (!container || !target) continue;
      const localStart = elapsed - i * stagger;
      if (localStart < 0) {
        done = false;
        continue;
      }
      const t = clamp(localStart / duration, 0, 1);
      const eased = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
      container.alpha = eased;
      const scale = 0.5 + 0.5 * eased;
      container.scale.set(scale);
      if (t < 1) done = false;

      const parentId = parentMap.get(id);
      if (parentId !== undefined) {
        const parentPos = positions.get(parentId);
      if (parentPos) {
          const fromPoint = getConnector(parentPos, "bottom");
          const toPoint = getConnector(target, "top");
          const midY = (fromPoint.y + toPoint.y) / 2;
          const fromDepth = depthMap.get(parentId) ?? 0;
          const toDepth = depthMap.get(id) ?? fromDepth + 1;
          const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
          const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
          const p0 = fromPoint;
          const p1 = { x: fromPoint.x, y: midY };
          const p2 = { x: toPoint.x, y: midY };
          const p3 = toPoint;
          drawGradientBezierPartial(
            animEdgeLayer,
            p0,
            p1,
            p2,
            p3,
            fromColor,
            toColor,
            eased,
            4,
            1
          );
          const tip = bezierPoint(p0, p1, p2, p3, eased);
          const offset = CARD_HEIGHT / 2 + CONNECTOR_OFFSET;
          container.position.set(tip.x, tip.y + offset);
        } else {
          container.position.set(target.x, target.y);
        }
      } else {
        container.position.set(target.x, target.y);
      }

      if (t >= 1 && parentId !== undefined) {
        container.position.set(target.x, target.y);
      }
    }

    if (done) {
      app.ticker.remove(tick);
      animEdgeLayer.clear();
      animating = false;
      for (const id of order) {
        const container = nodeContainers.get(id);
        const target = positions.get(id);
        if (container && target) {
          container.position.set(target.x, target.y);
          container.alpha = 1;
          container.scale.set(1);
        }
      }
      if (enteringActive.size > 0) {
        enteringActive = new Set();
        renderEdges(currentLayout, positions);
      }
    }
  });
}

function animateOut(exiting: Container[]) {
  const start = performance.now();
  const duration = 260;

  app.ticker.add(function tick() {
    const now = performance.now();
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 2);
    for (const container of exiting) {
      container.alpha = 1 - eased;
      const scale = 0.7 + 0.3 * (1 - eased);
      container.scale.set(scale);
    }

    if (t >= 1) {
      for (const container of exiting) {
        exitLayer.removeChild(container);
      }
      app.ticker.remove(tick);
    }
  });
}


function drawGradientBezier(
  graphics: Graphics,
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position,
  colorStart: number,
  colorEnd: number,
  width = 4,
  alpha = 1
) {
  for (let i = 0; i < EDGE_SEGMENTS; i += 1) {
    const t0 = i / EDGE_SEGMENTS;
    const t1 = (i + 1) / EDGE_SEGMENTS;
    const a = bezierPoint(p0, p1, p2, p3, t0);
    const b = bezierPoint(p0, p1, p2, p3, t1);
    const color = lerpColor(colorStart, colorEnd, (t0 + t1) / 2);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.stroke({
      width,
      color,
      alpha,
      cap: "butt",
      join: "round",
    });
  }
}

function drawGradientBezierPartial(
  graphics: Graphics,
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position,
  colorStart: number,
  colorEnd: number,
  progress: number,
  width = 4,
  alpha = 1
) {
  const segments = Math.max(1, Math.floor(EDGE_SEGMENTS * progress));
  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * progress;
    const t1 = ((i + 1) / segments) * progress;
    const a = bezierPoint(p0, p1, p2, p3, t0);
    const b = bezierPoint(p0, p1, p2, p3, t1);
    const color = lerpColor(colorStart, colorEnd, (t0 + t1) / 2);
    graphics.moveTo(a.x, a.y);
    graphics.lineTo(b.x, b.y);
    graphics.stroke({
      width,
      color,
      alpha,
      cap: "butt",
      join: "round",
    });
  }
}

function bezierPoint(p0: Position, p1: Position, p2: Position, p3: Position, t: number) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function lerpColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) + (rg << 8) + rb;
}

function mixColor(base: number, target: number, amount: number) {
  return lerpColor(base, target, amount);
}

function getConnector(pos: Position, side: "top" | "bottom"): Position {
  const offset =
    (CARD_HEIGHT / 2 + CONNECTOR_OFFSET) * (side === "bottom" ? 1 : -1);
  return { x: pos.x, y: pos.y + offset };
}

function fitToScreen(padding: number) {
  const width = containerEl.clientWidth;
  const height = containerEl.clientHeight;
  if (!width || !height) return;

  const scaleX = (width - padding) / treeSize.width;
  const scaleY = (height - padding) / treeSize.height;
  const scale = clamp(Math.min(scaleX, scaleY), 0.2, 3.5);

  world.scale.set(scale);
  world.position.set(
    (width - treeSize.width * scale) / 2,
    (height - treeSize.height * scale) / 2
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

app.ticker.add(() => {
  highlightLayer.alpha = 1;
});
