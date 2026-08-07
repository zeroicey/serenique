import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// vitest 未开启 globals，RTL 的自动 afterEach(cleanup) 不会注册；这里显式清理，避免用例间 DOM 残留。
afterEach(cleanup)

// jsdom 未实现 matchMedia，next-themes 依赖它。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom 未实现 IntersectionObserver，滚动加载组件依赖它。
class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

// jsdom 未实现 createObjectURL，新建页本地预览依赖它。
URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL
URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL

// jsdom 未实现 ResizeObserver；Base UI / Floating UI（dropdown 等浮层定位）依赖它。
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

// jsdom 无布局；Floating UI 定位 anchor 需要 getBoundingClientRect 返回矩形。
Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect
})
