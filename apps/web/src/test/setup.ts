import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

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
