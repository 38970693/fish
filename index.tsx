import React from 'react';
import ReactDOM from 'react-dom/client';
// ⚠️ 必须指向 src/：根目录曾是重构前的旧实现，
// 这个 import 以前指向 './App'（根目录旧文件），导致 vite build 一直打的是旧游戏，
// 而 tsc/vitest 检查的都是 src/ —— 测试全绿但产物是旧代码，构建验证全程假绿。
import App from './src/App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);