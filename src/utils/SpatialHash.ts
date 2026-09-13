/**
 * 四叉树空间索引（QuadTree）—— 把「每帧 O(n²) 的邻近查询」降下来。
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么需要它（2026-09-13 性能基线的结论，见 scripts/probe-perf.mjs）
 * ─────────────────────────────────────────────────────────────
 * 逻辑层每帧 ~1.7ms，其中 `worldSystem` 的障碍物推挤占 ~29%：
 * `resolveObstacles` 对**每个**实体把**全部**障碍物扫两遍
 * （180 实体 × 57 障碍 × 2 遍 ≈ 2 万次 `Math.hypot`/帧），而绝大多数障碍物
 * 根本不在附近 —— 这正是空间索引要解决的「宽相位」问题。
 * `aiSystem` 的 `findNearest` 同理：每条鱼每帧把全部候选扫一到两遍，
 * 而且此前还要为每条鱼 `[player, ...entities]` 新分配一个数组。
 *
 * ─────────────────────────────────────────────────────────────
 * 设计取舍（每一条都有理由）
 * ─────────────────────────────────────────────────────────────
 * ① **每帧整棵重建，不做增量更新。** n ≤ 250 时重建只要几十微秒，
 *    换来的是「树永远和当前帧一致」—— 不存在「实体动了但树没更新」这类 bug。
 *    增量更新的复杂度（移动要删了重插、跨节点要处理）在这个数量级完全不划算。
 *
 * ② **节点池复用，查询用显式栈，结果写进调用方给的数组。** 三件事是同一件事：
 *    这个类每帧被调用几十上百次，任何一次 `new` 都是 GC 压力，
 *    而 GC 暂停正是「帧耗时 p50 很低、p95 却爆表」的常见元凶。
 *
 * ③ **按圆心插入、按「膨胀后的查询圆」下钻。** 物品有半径，如果只按圆心判定
 *    会漏掉「圆心在节点外、身体伸进查询范围」的物品。做法：rebuild 时记下
 *    `maxRadius`，下钻时把查询圆膨胀 `maxRadius` —— 这是保守但正确的超集，
 *    多出来的那几个由调用方的精确判定（`d < minDist`）过滤掉。
 *
 * ④ **返回下标而不是对象。** 调用方往往还需要「原数组顺序」来做平局裁决
 *    （AI 锁定的迟滞、障碍物推挤的先后都对顺序敏感），拿到下标排序即可。
 *
 * ⚠️ 旧版这里有一个从未被用过的 `QuadTree`（`insert` 会把越界物品**静默丢弃**、
 *    `clear()` 每帧重新分配整棵树、`query()` 每次分配结果数组）。
 *    它是死代码，本文件是重写而不是修补 —— 旧接口没有调用方，直接替换。
 */

/** 能被索引的最小形状：圆心 + 半径（Entity / Obstacle 都天然满足） */
export interface SpatialItem {
  x: number;
  y: number;
  radius: number;
}

/** 叶子超过这个数量才细分。查询时叶子里的每个物品都要做一次距离判定，叶子小一点更省 */
const MAX_ITEMS_PER_NODE = 8;
/** 最大深度：所有物品叠在同一个点时靠它兜底，避免无限细分 */
const MAX_DEPTH = 8;

interface QNode {
  /** 正方形左上角 + 边长（正方形让「落在哪个象限」只需要两次比较） */
  x: number;
  y: number;
  size: number;
  depth: number;
  /** 叶子持有的物品**下标**（指向 `QuadTree.items`）；有子节点时为空数组 */
  items: number[];
  /** 第一个子节点在节点池里的下标（4 个连续）；-1 表示叶子 */
  children: number;
}

export class QuadTree<T extends SpatialItem> {
  /** 节点池：`rebuild` 只重置 `nodeCount`，绝不重新分配对象 → 零 GC 压力 */
  private nodes: QNode[];
  private nodeCount = 0;
  /** 本次 rebuild 的物品。`queryCircle` 返回的是下标，用 `itemAt` 取回对象 */
  private items: readonly T[] = [];
  /** 物品半径的最大值：查询时用它膨胀查询圆，保证不漏「身体伸进来」的物品 */
  private maxRadius = 0;
  /** 查询用的显式栈（复用，避免递归闭包分配） */
  private stack: number[] = [];

  constructor(capacity = 256) {
    this.nodes = [];
    // 预热节点池：第一次 rebuild 就不用边插边扩容
    for (let i = 0; i < capacity; i += 1) this.nodes.push(this.blankNode());
  }

  private blankNode(): QNode {
    return { x: 0, y: 0, size: 0, depth: 0, items: [], children: -1 };
  }

  /** 从池里取一个节点，并把它重置成干净的叶子 */
  private allocNode(): QNode {
    let n: QNode;
    if (this.nodeCount < this.nodes.length) {
      n = this.nodes[this.nodeCount];
    } else {
      n = this.blankNode();
      this.nodes.push(n);
    }
    this.nodeCount += 1;
    n.items.length = 0;
    n.children = -1;
    return n;
  }

  /**
   * 每帧重建。调用方**不要**在两次 rebuild 之间改动传进来的数组
   * （本类持有的是引用，查询时按下标回读）。
   */
  rebuild(items: readonly T[]): void {
    this.items = items;
    this.nodeCount = 0;
    this.maxRadius = 0;
    if (items.length === 0) return;

    // 根包围盒 = 所有物品圆的并集。越界的物品也照收（旧实现会静默丢弃 —— 那是 bug）
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of items) {
      if (it.x - it.radius < minX) minX = it.x - it.radius;
      if (it.y - it.radius < minY) minY = it.y - it.radius;
      if (it.x + it.radius > maxX) maxX = it.x + it.radius;
      if (it.y + it.radius > maxY) maxY = it.y + it.radius;
      if (it.radius > this.maxRadius) this.maxRadius = it.radius;
    }
    const root = this.allocNode();
    root.x = minX;
    root.y = minY;
    // 正方形（四叉树要求）：取包围盒较长的那条边，+1 防止零尺寸
    root.size = Math.max(maxX - minX, maxY - minY) + 1;
    root.depth = 0;

    for (let i = 0; i < items.length; i += 1) this.insert(root, i);
  }

  itemAt(index: number): T {
    return this.items[index];
  }

  get size(): number {
    return this.items.length;
  }

  private insert(node: QNode, index: number): void {
    if (node.children >= 0) {
      const it = this.items[index];
      this.insert(this.childFor(node, it.x, it.y), index);
      return;
    }
    node.items.push(index);
    if (node.items.length > MAX_ITEMS_PER_NODE && node.depth < MAX_DEPTH) {
      this.subdivide(node);
    }
  }

  /** 圆心落在哪个象限（压线算右边 / 下边，和 insert 用同一套规则才不会丢） */
  private childFor(node: QNode, x: number, y: number): QNode {
    const half = node.size / 2;
    const col = x >= node.x + half ? 1 : 0;
    const row = y >= node.y + half ? 1 : 0;
    return this.nodes[node.children + row * 2 + col];
  }

  private subdivide(node: QNode): void {
    const half = node.size / 2;
    const depth = node.depth + 1;
    const base = this.nodeCount;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const c = this.allocNode();
        c.x = node.x + col * half;
        c.y = node.y + row * half;
        c.size = half;
        c.depth = depth;
      }
    }
    node.children = base;

    // 原叶子里的物品下沉到「圆心所在」的象限；子节点若又超员会在 insert 里继续细分
    const pending = node.items;
    node.items = [];
    for (const index of pending) {
      const it = this.items[index];
      this.insert(this.childFor(node, it.x, it.y), index);
    }
  }

  /**
   * 圆形范围查询（宽相位：返回的是**超集**，精确判定由调用方做）。
   *
   * 结果写进调用方传入的 `out`（先清空），返回个数 —— 全程零分配。
   * `out` 里是 `rebuild` 时传入数组的**下标**，用 `itemAt(i)` 取对象。
   * ⚠️ 顺序不保证；需要原数组顺序的调用方请自己按下标排序。
   */
  queryCircle(x: number, y: number, radius: number, out: number[]): number {
    out.length = 0;
    if (this.nodeCount === 0) return 0;

    // 膨胀：物品有半径，圆心在节点外但身体伸进查询范围的物品不能漏
    const reach = radius + this.maxRadius;
    const reachSq = reach * reach;
    const stack = this.stack;
    stack.length = 0;
    stack.push(0);

    while (stack.length > 0) {
      const n = this.nodes[stack.pop() as number];
      // 节点正方形到查询圆心的最近点距离（比 AABB 相交判定更紧）
      const cx = x < n.x ? n.x : x > n.x + n.size ? n.x + n.size : x;
      const cy = y < n.y ? n.y : y > n.y + n.size ? n.y + n.size : y;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > reachSq) continue;

      if (n.children >= 0) {
        for (let k = 0; k < 4; k += 1) stack.push(n.children + k);
      } else {
        for (const index of n.items) {
          const it = this.items[index];
          const ddx = it.x - x;
          const ddy = it.y - y;
          const rr = radius + it.radius;
          if (ddx * ddx + ddy * ddy <= rr * rr) out.push(index);
        }
      }
    }
    return out.length;
  }
}
