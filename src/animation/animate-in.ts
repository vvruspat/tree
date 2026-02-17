import type { Application, Graphics } from "pixi.js";
import { CARD_HEIGHT, CONNECTOR_OFFSET, DEPTH_COLORS } from "../constants";
import { renderEdges } from "../rendering/edges";
import { state } from "../state";
import type { Position } from "../types";
import { bezierPoint, getConnector } from "../utils/geometry";
import { drawGradientBezierPartial } from "../utils/graphics";
import { clamp } from "../utils/math";

export function animateIn(
  app: Application,
  animEdgeLayer: Graphics,
  order: number[],
  positions: Map<number, Position>
) {
  if (state.animating) return;
  state.animating = true;
  const start = performance.now();
  const duration = 420;
  const stagger = 20;

  for (const id of order) {
    const container = state.nodeContainers.get(id);
    if (!container) continue;
    const target = positions.get(id);
    if (!target) continue;
    const parentId = state.parentMap.get(id);
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
      const container = state.nodeContainers.get(id);
      const target = positions.get(id);
      if (!container || !target) continue;
      const localStart = elapsed - i * stagger;
      if (localStart < 0) {
        done = false;
        continue;
      }
      const t = clamp(localStart / duration, 0, 1);
      const eased = t < 1 ? 1 - (1 - t) ** 3 : 1;
      container.alpha = eased;
      const scale = 0.5 + 0.5 * eased;
      container.scale.set(scale);
      if (t < 1) done = false;

      const parentId = state.parentMap.get(id);
      if (parentId !== undefined) {
        const parentPos = positions.get(parentId);
        if (parentPos) {
          const fromPoint = getConnector(parentPos, "bottom");
          const toPoint = getConnector(target, "top");
          const midY = (fromPoint.y + toPoint.y) / 2;
          const fromDepth = state.depthMap.get(parentId) ?? 0;
          const toDepth = state.depthMap.get(id) ?? fromDepth + 1;
          const fromColor = DEPTH_COLORS[fromDepth % DEPTH_COLORS.length];
          const toColor = DEPTH_COLORS[toDepth % DEPTH_COLORS.length];
          const p0 = fromPoint;
          const p1 = { x: fromPoint.x, y: midY };
          const p2 = { x: toPoint.x, y: midY };
          const p3 = toPoint;
          drawGradientBezierPartial(animEdgeLayer, p0, p1, p2, p3, fromColor, toColor, eased, 4, 1);
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
      state.animating = false;
      for (const id of order) {
        const container = state.nodeContainers.get(id);
        const target = positions.get(id);
        if (container && target) {
          container.position.set(target.x, target.y);
          container.alpha = 1;
          container.scale.set(1);
        }
      }
      if (state.enteringActive.size > 0) {
        state.enteringActive = new Set();
        if (state.edgeLayer && state.currentLayout && state.positions) {
          renderEdges(state.edgeLayer, state.currentLayout, state.positions);
        }
      }
    }
  });
}
