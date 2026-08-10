import { useEffect, useState } from 'react'

// 通用防抖值：value 变化后 delayMs 内无新变化才更新返回值（选点搜索框用）。
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
