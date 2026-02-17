import type { Application, Container, Graphics } from "pixi.js";
import { animateIn } from "../animation/animate-in";
import { animateOut } from "../animation/animate-out";
import { CARD_HEIGHT, CARD_RADIUS, CARD_WIDTH, DEPTH_COLORS } from "../constants";
import {
  endNodeDrag as endNodeDragHelper,
  onNodePointerDown,
  onNodePointerUp,
  onNodeTap,
} from "../interactions/node-events";
import { computeDepths, layoutTree } from "../layout/tree-layout";
import { renderEdges } from "../rendering/edges";
import { renderNodes } from "../rendering/nodes";
import { state } from "../state";
import type { LayoutNode } from "../types";
import { getConnector } from "../utils/geometry";
import { drawGradientBezier } from "../utils/graphics";
import { clamp, mixColor } from "../utils/math";

export function buildVisibleLayout() {
  const visible = new Map<number, LayoutNode>();
  for (const node of state.fullLayout.values()) {
    const children = state.collapsed.has(node.id) ? [] : node.children;
    const next = { ...node, children: [...children] };
    visible.set(node.id, next);
  }
  return visible;
}

export function toggleCollapse(id: number, renderAll: () => void) {
  if (state.collapsed.has(id)) {
    state.collapsed.delete(id);
    const node = state.fullLayout.get(id);
    if (node) {
      for (const child of node.children) {
        state.collapsed.add(child);
      }
    }
  } else {
    state.collapsed.add(id);
  }
  renderAll();
}

export function highlightPath(targetId: number) {
  for (const [id, card] of state.nodeViews.entries()) {
    const depth = state.depthMap.get(id) ?? 0;
    const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
    const fillColor = mixColor(baseColor, 0xffffff, 0.7);
    card.clear();
    card.lineStyle(2.5, baseColor, 1);
    card.beginFill(fillColor, 1);
    card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    card.endFill();
  }

  state.highlightLayer?.clear();

  let current = targetId;
  while (state.parentMap.has(current)) {
    const parent = state.parentMap.get(current);
    if (parent === undefined) break;
    const from = state.positions.get(parent);
    const to = state.positions.get(current);
    if (from && to && state.highlightLayer) {
      const fromPoint = getConnector(from, "bottom");
      const toPoint = getConnector(to, "top");
      const midY = (fromPoint.y + toPoint.y) / 2;
      const fromDepth = state.depthMap.get(parent) ?? 0;
      const toDepth = state.depthMap.get(current) ?? fromDepth + 1;
      const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
      const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
      drawGradientBezier(
        state.highlightLayer,
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
    const card = state.nodeViews.get(highlight);
    if (card) {
      const depth = state.depthMap.get(highlight) ?? 0;
      const baseColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
      const fillColor = mixColor(baseColor, 0xffffff, 0.7);
      card.clear();
      card.lineStyle(2.5, baseColor, 1);
      card.beginFill(fillColor, 1);
      card.drawRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      card.endFill();
    }
    const parent = state.parentMap.get(highlight);
    if (parent === undefined) break;
    highlight = parent;
  }
}

export function fitToScreen(containerEl: HTMLDivElement, padding: number) {
  if (!state.world) return;
  const width = containerEl.clientWidth;
  const height = containerEl.clientHeight;
  if (!width || !height) return;

  const scaleX = (width - padding) / state.treeSize.width;
  const scaleY = (height - padding) / state.treeSize.height;
  const scale = clamp(Math.min(scaleX, scaleY), 0.2, 3.5);

  state.world.scale.set(scale);
  state.world.position.set(
    (width - state.treeSize.width * scale) / 2,
    (height - state.treeSize.height * scale) / 2
  );
}

export function renderAll(
  app: Application,
  world: Container,
  edgeLayer: Graphics,
  animEdgeLayer: Graphics,
  nodeLayer: Container,
  exitLayer: Container,
  highlightLayer: Graphics,
  containerEl: HTMLDivElement
) {
  const prevIds = new Set(state.nodeContainers.keys());
  const visibleLayout = buildVisibleLayout();
  state.currentLayout = visibleLayout;
  state.depthMap = computeDepths(state.currentLayout, state.roots);
  const layoutInfo = layoutTree(visibleLayout, state.roots);
  const targetPositions = layoutInfo.positions;
  state.treeSize = {
    width: Math.max(1, layoutInfo.width),
    height: Math.max(1, layoutInfo.height),
  };

  const nextIds = new Set(visibleLayout.keys());
  const entering: number[] = [];
  const exiting: Container[] = [];
  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      const container = state.nodeContainers.get(id);
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
  state.positions = targetPositions;

  edgeLayer.clear();
  animEdgeLayer.clear();
  highlightLayer.clear();
  nodeLayer.removeChildren();
  state.nodeViews.clear();
  state.labelViews.clear();
  state.nodeContainers.clear();
  state.parentMap.clear();

  for (const node of visibleLayout.values()) {
    for (const child of node.children) {
      if (!state.parentMap.has(child)) {
        state.parentMap.set(child, node.id);
      }
    }
  }

  if (entering.length > 0) {
    state.enteringActive = new Set(entering);
  } else {
    state.enteringActive = new Set();
  }
  renderEdges(edgeLayer, visibleLayout, state.positions);

  const renderAllWrapper = () => {
    renderAll(app, world, edgeLayer, animEdgeLayer, nodeLayer, exitLayer, highlightLayer, containerEl);
  };

  const endNodeDrag = () => endNodeDragHelper((id) => toggleCollapse(id, renderAllWrapper), highlightPath);

  renderNodes(
    nodeLayer,
    visibleLayout,
    state.positions,
    (nodeId, event, container) => onNodePointerDown(nodeId, event, container, world),
    (nodeId) => onNodeTap(nodeId, highlightPath),
    (event) => onNodePointerUp(event, endNodeDrag)
  );

  if (prevIds.size === 0) {
    fitToScreen(containerEl, state.padding);
  }
  if (state.selectedNodeId !== null) {
    highlightPath(state.selectedNodeId);
  }
  if (entering.length > 0) {
    animateIn(app, animEdgeLayer, entering, targetPositions);
  }
  if (exiting.length > 0) {
    animateOut(app, exitLayer, exiting);
  }
}
