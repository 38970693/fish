/**
 * 事件总线 —— 逻辑层与表现层之间的解耦带。
 *
 * 为什么需要它：现在所有"吃鱼冒字""进化放粒子"都硬编码在战斗逻辑里，
 * 将来要加音效就得回头改 combat.ts。改成事件后：
 *   - 逻辑层只管 emit('eat', {...})
 *   - 粒子 / 飘字 / 音效各自 subscribe，互不知道对方存在
 * 加音效 = 新增一个订阅者，不动任何逻辑代码。
 */

export type EventHandler<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export class EventBus<M> {
  private handlers = new Map<keyof M, Set<EventHandler<any>>>();

  /** 订阅事件，返回取消订阅函数 */
  on<K extends keyof M>(type: K, handler: EventHandler<M[K]>): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  once<K extends keyof M>(type: K, handler: EventHandler<M[K]>): Unsubscribe {
    const unsubscribe = this.on(type, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off<K extends keyof M>(type: K, handler: EventHandler<M[K]>): void {
    this.handlers.get(type)?.delete(handler);
  }

  /** 广播：单个订阅者抛错不影响其他人 */
  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[事件处理失败] ${String(type)}`, error);
      }
    }
  }

  clear(type?: keyof M): void {
    if (type) this.handlers.delete(type);
    else this.handlers.clear();
  }

  listenerCount(type: keyof M): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}
