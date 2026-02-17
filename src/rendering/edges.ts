import type { Graphics } from "pixi.js";
import { DEPTH_COLORS } from "../constants";
import { state } from "../state";
import type { LayoutNode, Position } from "../types";
import { getConnector } from "../utils/geometry";
import { drawGradientBezier } from "../utils/graphics";

export function renderEdges(
  edgeLayer: Graphics,
  layout: Map<number, LayoutNode>,
  positions: Map<number, Position>
) {
  edgeLayer.clear();
  for (const node of layout.values()) {
    const start = positions.get(node.id);
    if (!start) continue;
    for (const childId of node.children) {
      if (state.enteringActive.has(childId)) continue;
      const end = positions.get(childId);
      if (!end) continue;
      const from = getConnector(start, "bottom");
      const to = getConnector(end, "top");
      const midY = (from.y + to.y) / 2;
      const fromDepth = state.depthMap.get(node.id) ?? 0;
      const toDepth = state.depthMap.get(childId) ?? fromDepth + 1;
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
