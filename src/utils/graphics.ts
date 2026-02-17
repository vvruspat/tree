import type { Graphics } from "pixi.js";
import { EDGE_SEGMENTS } from "../constants";
import type { Position } from "../types";
import { bezierPoint } from "./geometry";
import { lerpColor } from "./math";

export function drawGradientBezier(
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

export function drawGradientBezierPartial(
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
