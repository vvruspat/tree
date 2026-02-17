import type { Container, FederatedPointerEvent } from "pixi.js";
import { state } from "../state";

export function onNodePointerDown(
  nodeId: number,
  event: FederatedPointerEvent,
  container: Container,
  world: Container
) {
  event.stopPropagation();
  state.draggingNodeId = nodeId;
  const totalChildren = state.fullLayout.get(nodeId)?.children.length ?? 0;
  state.clickCandidateId = totalChildren > 0 ? nodeId : null;
  const worldPoint = world.toLocal(event.global);
  state.dragStart = { x: worldPoint.x, y: worldPoint.y };
  state.dragOffset = {
    x: container.position.x - worldPoint.x,
    y: container.position.y - worldPoint.y,
  };
  state.dragMoved = false;
}

export function onNodeTap(nodeId: number, highlightPath: (id: number) => void) {
  if (!state.dragMoved) {
    state.selectedNodeId = nodeId;
    highlightPath(nodeId);
  }
}

export function onNodePointerUp(event: FederatedPointerEvent, endNodeDrag: () => void) {
  event.stopPropagation();
  if (state.draggingNodeId !== null) {
    endNodeDrag();
  }
}

export function endNodeDrag(
  toggleCollapse: (id: number) => void,
  highlightPath: (id: number) => void
) {
  state.draggingNodeId = null;
  if (state.clickCandidateId !== null && !state.dragMoved) {
    state.selectedNodeId = state.clickCandidateId;
    highlightPath(state.clickCandidateId);
    toggleCollapse(state.clickCandidateId);
  }
  state.clickCandidateId = null;
  state.dragMoved = false;
}
