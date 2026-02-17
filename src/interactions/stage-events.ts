import type { Container, FederatedPointerEvent } from "pixi.js";
import { renderEdges } from "../rendering/edges";
import { state } from "../state";

export function setupStageInteractions(
  stage: Container,
  world: Container,
  canvas: HTMLCanvasElement,
  endNodeDrag: () => void,
  fitToScreen: (padding: number) => void
) {
  stage.eventMode = "static";
  stage.hitArea = {
    contains: () => true,
  };

  stage.on("pointerdown", (event: FederatedPointerEvent) => {
    if (state.draggingNodeId !== null) return;
    state.isDragging = true;
    state.dragStart = { x: event.global.x, y: event.global.y };
    state.worldStart = { x: world.x, y: world.y };
  });

  stage.on("pointerup", () => {
    state.isDragging = false;
    if (state.draggingNodeId !== null) {
      endNodeDrag();
    }
  });

  stage.on("pointerupoutside", () => {
    state.isDragging = false;
    if (state.draggingNodeId !== null) {
      endNodeDrag();
    }
  });

  stage.on("pointermove", (event: FederatedPointerEvent) => {
    if (state.draggingNodeId !== null) {
      const container = state.nodeContainers.get(state.draggingNodeId);
      if (!container) return;
      const worldPoint = world.toLocal(event.global);
      const nextX = worldPoint.x + state.dragOffset.x;
      const nextY = worldPoint.y + state.dragOffset.y;
      container.position.set(nextX, nextY);
      state.positions.set(state.draggingNodeId, { x: nextX, y: nextY });
      if (
        Math.abs(worldPoint.x - state.dragStart.x) > 6 ||
        Math.abs(worldPoint.y - state.dragStart.y) > 6
      ) {
        state.dragMoved = true;
      }
      if (state.edgeLayer && state.currentLayout && state.positions) {
        renderEdges(state.edgeLayer, state.currentLayout, state.positions);
      }
      if (state.highlightLayer) {
        state.highlightLayer.clear();
      }
      return;
    }
    if (!state.isDragging) return;
    const dx = event.global.x - state.dragStart.x;
    const dy = event.global.y - state.dragStart.y;
    world.position.set(state.worldStart.x + dx, state.worldStart.y + dy);
    // Mark that user has manually panned the view
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      state.hasUserPanned = true;
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      const zoom = direction > 0 ? 0.96 : 1.04;
      const newScale = Math.max(0.2, Math.min(3.5, world.scale.x * zoom));

      const rect = canvas.getBoundingClientRect();
      let zoomPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      // If user hasn't panned yet, zoom around the first/selected node
      if (!state.hasUserPanned) {
        let targetNodeId: number | null = state.selectedNodeId;
        if (targetNodeId === null && state.roots.length > 0) {
          const firstRoot = state.roots[0];
          if (firstRoot !== undefined) {
            targetNodeId = firstRoot;
          }
        }
        if (targetNodeId !== null) {
          const targetPos = state.positions.get(targetNodeId);
          if (targetPos) {
            // Convert world position to screen position
            zoomPoint = {
              x: targetPos.x * world.scale.x + world.x,
              y: targetPos.y * world.scale.y + world.y,
            };
          }
        }
      }

      const worldPos = {
        x: (zoomPoint.x - world.x) / world.scale.x,
        y: (zoomPoint.y - world.y) / world.scale.y,
      };

      world.scale.set(newScale);
      world.position.set(zoomPoint.x - worldPos.x * newScale, zoomPoint.y - worldPos.y * newScale);
    },
    { passive: false }
  );

  window.addEventListener("resize", () => fitToScreen(state.padding));
}
