import type { Application, Container } from "pixi.js";
import { clamp } from "../utils/math";

export function animateOut(app: Application, exitLayer: Container, exiting: Container[]) {
  const start = performance.now();
  const duration = 260;

  app.ticker.add(function tick() {
    const now = performance.now();
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - (1 - t) ** 2;
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
