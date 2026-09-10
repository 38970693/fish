import { Entity } from '../types';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface QuadTreeNode {
  bounds: Bounds;
  entities: Entity[];
  children: QuadTreeNode[] | null;
  depth: number;
}

const MAX_ENTITIES_PER_NODE = 10;
const MAX_DEPTH = 8;

function createNode(bounds: Bounds, depth: number): QuadTreeNode {
  return {
    bounds,
    entities: [],
    children: null,
    depth,
  };
}

function subdivide(node: QuadTreeNode): void {
  const { x, y, width, height } = node.bounds;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const nextDepth = node.depth + 1;

  node.children = [
    createNode({ x, y, width: halfWidth, height: halfHeight }, nextDepth),
    createNode({ x: x + halfWidth, y, width: halfWidth, height: halfHeight }, nextDepth),
    createNode({ x, y: y + halfHeight, width: halfWidth, height: halfHeight }, nextDepth),
    createNode({ x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight }, nextDepth),
  ];

  for (const entity of node.entities) {
    insertEntityIntoChildren(node, entity);
  }
  node.entities = [];
}

function insertEntityIntoChildren(node: QuadTreeNode, entity: Entity): void {
  if (!node.children) return;

  for (const child of node.children) {
    if (containsEntity(child.bounds, entity)) {
      insertEntity(child, entity);
      return;
    }
  }
}

function containsEntity(bounds: Bounds, entity: Entity): boolean {
  return (
    entity.x >= bounds.x &&
    entity.x < bounds.x + bounds.width &&
    entity.y >= bounds.y &&
    entity.y < bounds.y + bounds.height
  );
}

function insertEntity(node: QuadTreeNode, entity: Entity): void {
  if (node.children) {
    insertEntityIntoChildren(node, entity);
    return;
  }

  node.entities.push(entity);

  if (node.entities.length > MAX_ENTITIES_PER_NODE && node.depth < MAX_DEPTH) {
    subdivide(node);
  }
}

function queryRange(node: QuadTreeNode, x: number, y: number, radius: number, result: Entity[]): void {
  const halfWidth = node.bounds.width / 2;
  const halfHeight = node.bounds.height / 2;
  const centerX = node.bounds.x + halfWidth;
  const centerY = node.bounds.y + halfHeight;

  if (node.children) {
    for (const child of node.children) {
      if (intersectsCircle(child.bounds, x, y, radius)) {
        queryRange(child, x, y, radius, result);
      }
    }
    return;
  }

  for (const entity of node.entities) {
    const dx = entity.x - x;
    const dy = entity.y - y;
    if (dx * dx + dy * dy <= radius * radius) {
      result.push(entity);
    }
  }
}

function intersectsCircle(bounds: Bounds, cx: number, cy: number, r: number): boolean {
  const closestX = Math.max(bounds.x, Math.min(cx, bounds.x + bounds.width));
  const closestY = Math.max(bounds.y, Math.min(cy, bounds.y + bounds.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

export class QuadTree {
  private root: QuadTreeNode;

  constructor(worldSize: number) {
    this.root = createNode({ x: 0, y: 0, width: worldSize, height: worldSize }, 0);
  }

  clear(): void {
    this.root = createNode(this.root.bounds, 0);
  }

  insert(entity: Entity): void {
    if (containsEntity(this.root.bounds, entity)) {
      insertEntity(this.root, entity);
    }
  }

  insertAll(entities: Entity[]): void {
    for (const entity of entities) {
      this.insert(entity);
    }
  }

  query(x: number, y: number, radius: number): Entity[] {
    const result: Entity[] = [];
    queryRange(this.root, x, y, radius, result);
    return result;
  }

  queryPlayer(x: number, y: number, radius: number, playerRadius: number): Entity[] {
    const result: Entity[] = [];
    const totalRadius = radius + playerRadius;
    queryRange(this.root, x, y, totalRadius, result);
    return result;
  }
}