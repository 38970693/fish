import '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock canvas context
HTMLCanvasElement.prototype.getContext = () => ({
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  clearRect: () => {},
  fillRect: () => {},
  beginPath: () => {},
  arc: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fill: () => {},
  save: () => {},
  restore: () => {},
  translate: () => {},
  rotate: () => {},
  scale: () => {},
  drawImage: () => {},
  setTransform: () => {},
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  createLinearGradient: () => ({
    addColorStop: () => {},
  }),
  createRadialGradient: () => ({
    addColorStop: () => {},
  }),
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  closePath: () => {},
  rect: () => {},
  ellipse: () => {},
  clip: () => {},
  isPointInPath: () => false,
  isPointInStroke: () => false,
  lineWidth: 1,
  strokeStyle: '',
  fillStyle: '',
  font: '',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  imageSmoothingEnabled: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback) => {
  setTimeout(callback, 16);
  return 0;
};

global.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock crypto.randomUUID
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => Math.random().toString(36).substring(2);
}