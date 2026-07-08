const isDev = import.meta.env.DEV;

export const logger = {
  // error 第二参数接受 unknown 而非 Error，让 catch (err) 调用方无需类型转换直接传入
  // 符合 TS 4.4+ catch 子句 err 为 unknown 的类型语义，避免每处调用都写 instanceof 判断
  error: (message: string, error?: unknown) => {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error);
    }
  },
  warn: (message: string) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`);
    }
  },
  info: (message: string) => {
    if (isDev) {
      console.info(`[INFO] ${message}`);
    }
  },
  debug: (message: string) => {
    if (isDev) {
      console.debug(`[DEBUG] ${message}`);
    }
  },
};