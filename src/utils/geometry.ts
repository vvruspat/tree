import { CARD_HEIGHT, CONNECTOR_OFFSET } from "../constants";
import type { Position } from "../types";

export function bezierPoint(p0: Position, p1: Position, p2: Position, p3: Position, t: number) {
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

export function getConnector(pos: Position, side: "top" | "bottom"): Position {
  const offset = (CARD_HEIGHT / 2 + CONNECTOR_OFFSET) * (side === "bottom" ? 1 : -1);
  return { x: pos.x, y: pos.y + offset };
}
