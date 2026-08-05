import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('合并 tailwind class 冲突', () => {
    expect(cn('px-2', 'px-3')).toBe('px-3')
  })

  it('忽略 falsy 值', () => {
    expect(cn('a', undefined, '', 'b')).toBe('a b')
  })
})
