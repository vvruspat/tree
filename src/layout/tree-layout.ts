import type { WordNode } from "../data";
import type { LayoutNode, Position } from "../types";

export function buildLayout(data: WordNode[]) {
  const layout = new Map<number, LayoutNode>();
  const roots: number[] = [];

  const visit = (node: WordNode, parentId?: number) => {
    if (!layout.has(node.id)) {
      layout.set(node.id, { ...node, children: node.a.map((child) => child.id) });
    }

    if (parentId === undefined) {
      roots.push(node.id);
    }

    for (const child of node.a) {
      visit(child, node.id);
    }
  };

  for (const node of data) {
    visit(node);
  }

  const children = new Set<number>();
  for (const node of layout.values()) {
    for (const childId of node.children) {
      children.add(childId);
    }
  }

  const inferredRoots = [...layout.values()]
    .filter((node) => !children.has(node.id))
    .map((node) => node.id);

  const finalRoots = roots.length > 0 ? roots : inferredRoots;
  if (finalRoots.length === 0 && data.length > 0) {
    finalRoots.push(data[0].id);
  }

  return { layout, roots: finalRoots };
}

export function layoutTree(layout: Map<number, LayoutNode>, roots: number[]) {
  const positions = new Map<number, Position>();
  const spacingX = 240;
  const spacingY = 170;
  let nextX = 0;

  const placeNode = (id: number, depth: number): number => {
    const node = layout.get(id);
    if (!node) return 0;
    const children = node.children.filter((child) => layout.has(child));

    if (children.length === 0) {
      const x = nextX;
      nextX += 1;
      positions.set(id, { x, y: depth });
      return x;
    }

    const childXs = children.map((child) => placeNode(child, depth + 1));
    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    positions.set(id, { x, y: depth });
    return x;
  };

  for (const root of roots) {
    placeNode(root, 0);
    nextX += 1;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  }

  for (const [id, pos] of positions.entries()) {
    positions.set(id, {
      x: (pos.x - minX) * spacingX,
      y: (pos.y - minY) * spacingY,
    });
  }

  return {
    positions,
    width: Math.max(1, (maxX - minX) * spacingX),
    height: Math.max(1, (maxY - minY) * spacingY),
  };
}

export function computeDepths(layout: Map<number, LayoutNode>, roots: number[]) {
  const depths = new Map<number, number>();
  const queue: Array<{ id: number; depth: number }> = roots.map((id) => ({
    id,
    depth: 0,
  }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (depths.has(current.id)) continue;
    depths.set(current.id, current.depth);
    const node = layout.get(current.id);
    if (!node) continue;
    for (const child of node.children) {
      if (!depths.has(child)) {
        queue.push({ id: child, depth: current.depth + 1 });
      }
    }
  }

  return depths;
}
