import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 冷缓存页面导航最长可用 60s；用例总时限必须覆盖它和后续交互。
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // 用完整 Chromium 的新 headless 模式，避开对 chrome-headless-shell 的额外下载依赖
    channel: 'chromium',
    /**
     * 导航超时放宽到 60s（默认 30s）。
     *
     * 原因：dev server 下每个新 page 都要现取 **1749 个未打包模块**（Vite 的 transform 是
     * 按需的、而且 Playwright 每个用例都是全新 context = 空 HTTP 缓存）。机器负载一高
     * （本机常态：WorkBuddy 自身 + 4 个插件 node 进程占着 CPU），首个 `page.goto` 就会
     * 卡在 30s 线上 —— 表现是「一串 goto 超时」，但同一个用例下一轮又全绿，纯环境抖动。
     *
     * 只放宽**导航**这一项：断言仍然是 5s 默认（一个真坏掉的页面 60s 也该超时了），
     * 于是这条改动吸收的是「加载慢」，不会掩盖「页面坏了」。
     */
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
