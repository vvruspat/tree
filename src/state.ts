import type { Application, Container, Graphics, Text } from "pixi.js";
import type { LayoutNode, Position } from "./types";

export interface AppState {
  app: Application | null;
  world: Container | null;
  edgeLayer: Graphics | null;
  animEdgeLayer: Graphics | null;
  nodeLayer: Container | null;
  exitLayer: Container | null;
  highlightLayer: Graphics | null;
  fullLayout: Map<number, LayoutNode>;
  roots: number[];
  positions: Map<number, Position>;
  treeSize: { width: number; height: number };
  collapsed: Set<number>;
  currentLayout: Map<number, LayoutNode>;
  depthMap: Map<number, number>;
  animating: boolean;
  enteringActive: Set<number>;
  selectedNodeId: number | null;
  nodeViews: Map<number, Graphics>;
  labelViews: Map<number, Text>;
  nodeContainers: Map<number, Container>;
  parentMap: Map<number, number>;
  isDragging: boolean;
  dragStart: Position;
  worldStart: Position;
  draggingNodeId: number | null;
  dragOffset: Position;
  dragMoved: boolean;
  clickCandidateId: number | null;
  padding: number;
  hasUserPanned: boolean;
}

export const state: AppState = {
  app: null,
  world: null,
  edgeLayer: null,
  animEdgeLayer: null,
  nodeLayer: null,
  exitLayer: null,
  highlightLayer: null,
  fullLayout: new Map(),
  roots: [],
  positions: new Map(),
  treeSize: { width: 1, height: 1 },
  collapsed: new Set(),
  currentLayout: new Map(),
  depthMap: new Map(),
  animating: false,
  enteringActive: new Set(),
  selectedNodeId: null,
  nodeViews: new Map(),
  labelViews: new Map(),
  nodeContainers: new Map(),
  parentMap: new Map(),
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  worldStart: { x: 0, y: 0 },
  draggingNodeId: null,
  dragOffset: { x: 0, y: 0 },
  dragMoved: false,
  clickCandidateId: null,
  padding: 120,
  hasUserPanned: false,
};
