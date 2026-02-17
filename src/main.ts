import { Application, Container, Graphics } from "pixi.js";
import { fitToScreen, highlightPath, renderAll, toggleCollapse } from "./core/renderer";
import { nodes } from "./data";
import { endNodeDrag } from "./interactions/node-events";
import { setupStageInteractions } from "./interactions/stage-events";
import { buildLayout } from "./layout/tree-layout";
import { state } from "./state";

const containerEl = document.querySelector<HTMLDivElement>("#stage");
if (!containerEl) {
  throw new Error("Missing #stage container");
}

(async () => {
  const app = new Application();
  await app.init({
    resizeTo: containerEl,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  containerEl.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const { layout: fullLayout, roots } = buildLayout(nodes);
  state.fullLayout = fullLayout;
  state.roots = roots;

  const edgeLayer = new Graphics();
  const animEdgeLayer = new Graphics();
  const nodeLayer = new Container();
  const exitLayer = new Container();
  const highlightLayer = new Graphics();

  world.addChild(edgeLayer, animEdgeLayer, highlightLayer, nodeLayer, exitLayer);

  state.app = app;
  state.world = world;
  state.edgeLayer = edgeLayer;
  state.animEdgeLayer = animEdgeLayer;
  state.nodeLayer = nodeLayer;
  state.exitLayer = exitLayer;
  state.highlightLayer = highlightLayer;

  const renderAllWrapper = () => {
    renderAll(
      app,
      world,
      edgeLayer,
      animEdgeLayer,
      nodeLayer,
      exitLayer,
      highlightLayer,
      containerEl
    );
  };

  const endNodeDragWrapper = () => {
    endNodeDrag((id) => toggleCollapse(id, renderAllWrapper), highlightPath);
  };

  const fitToScreenWrapper = (padding: number) => {
    fitToScreen(containerEl, padding);
  };

  setupStageInteractions(app.stage, world, app.canvas, endNodeDragWrapper, fitToScreenWrapper);

  renderAllWrapper();

  app.ticker.add(() => {
    if (highlightLayer) {
      highlightLayer.alpha = 1;
    }
  });
})();
