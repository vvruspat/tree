import type { WordNode } from "./data";

export type Position = {
  x: number;
  y: number;
};

export type LayoutNode = WordNode & { children: number[] };
