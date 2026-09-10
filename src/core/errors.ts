/**
 * 容错层：让单个系统的崩溃不至于掀翻整个游戏循环。
 *
 * 设计原则：游戏是实时循环，一个系统抛异常就把玩家踢回桌面是最糟的体验。
 * 所以每个系统都被 safe() 包裹：出错时记录一次、继续跑；
 * 连续失败超过阈值则自动摘除该系统（并在控制台明确告知），其余系统照常。
 */

const ERROR_STYLE = 'color:#f87171;font-weight:bold';

export interface SafeOptions {
  /** 连续失败多少次后永久摘除该系统，默认 3 */
  maxFailures?: number;
  /** 摘除后是否仍打印日志，默认 false（避免刷屏） */
  verbose?: boolean;
}

export interface SafeWrapper {
  (...args: any[]): void;
  readonly systemName: string;
  readonly disabled: boolean;
}

/**
 * 把一个可能抛异常的系统函数包装成安全函数。
 * 包装后对象上带 systemName / disabled，便于开发期排查和热插拔。
 */
export function safe(name: string, fn: (...args: any[]) => void, options: SafeOptions = {}): SafeWrapper {
  const { maxFailures = 3, verbose = false } = options;
  let failures = 0;
  let disabled = false;

  const wrapped = (...args: any[]): void => {
    if (disabled) return;
    try {
      fn(...args);
    } catch (error) {
      failures += 1;
      console.error(`%c[系统异常] ${name}`, ERROR_STYLE, error);
      if (failures >= maxFailures) {
        disabled = true;
        console.warn(
          `[系统摘除] ${name} 连续失败 ${failures} 次，已自动停用。其余系统继续运行。`
        );
      }
    }
  };

  Object.defineProperty(wrapped, 'systemName', { value: name });
  Object.defineProperty(wrapped, 'disabled', { get: () => disabled });

  return wrapped as SafeWrapper;
}

/** 开发期断言：只在开发构建下报警，不中断游戏 */
export function softAssert(condition: unknown, message: string): boolean {
  if (!condition) {
    console.warn(`[数据校验] ${message}`);
    return false;
  }
  return true;
}

/** 安全读取嵌套属性，取不到就用默认值 */
export function safeGet<T>(source: unknown, path: string, fallback: T): T {
  try {
    const value = path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), source);
    return value === undefined || value === null ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

/**
 * 兜底执行：把不可信逻辑（比如数据驱动的配置回调）包起来，
 * 失败时返回 fallback 而不是抛出去。
 */
export function tryOr<T>(fn: () => T, fallback: T, label = 'unknown'): T {
  try {
    return fn();
  } catch (error) {
    console.error(`%c[执行失败] ${label}`, ERROR_STYLE, error);
    return fallback;
  }
}
