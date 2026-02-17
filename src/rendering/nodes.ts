import { Container, type FederatedPointerEvent, Graphics, Text, TextStyle } from "pixi.js";
import {
  CARD_HEIGHT,
  CARD_RADIUS,
  CARD_WIDTH,
  CONNECTOR_OFFSET,
  CONNECTOR_RADIUS,
  DEPTH_COLORS,
  STYLES,
} from "../constants";
import { state } from "../state";
import type { LayoutNode, Position } from "../types";
import { mixColor } from "../utils/math";

export function renderNodes(
  nodeLayer: Container,
  layout: Map<number, LayoutNode>,
  positions: Map<number, Position>,
  onNodePointerDown: (nodeId: number, event: FederatedPointerEvent, container: Container) => void,
  onNodeTap: (nodeId: number) => void,
  onNodePointerUp: (event: FederatedPointerEvent) => void
) {
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
    const depth = state.depthMap.get(node.id) ?? 0;
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
    const totalChildren = state.fullLayout.get(node.id)?.children.length ?? 0;
    container.eventMode = "static";
    container.cursor = totalChildren > 0 ? "pointer" : "default";
    container.on("pointerdown", (event: FederatedPointerEvent) => {
      onNodePointerDown(node.id, event, container);
    });
    container.on("pointertap", () => {
      onNodeTap(node.id);
    });
    container.on("pointerup", (event: FederatedPointerEvent) => {
      onNodePointerUp(event);
    });
    container.on("pointerupoutside", (event: FederatedPointerEvent) => {
      onNodePointerUp(event);
    });

    nodeLayer.addChild(container);
    state.nodeViews.set(node.id, card);
    state.labelViews.set(node.id, label);
    state.nodeContainers.set(node.id, container);
  }
}
