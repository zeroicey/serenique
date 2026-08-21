import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTestEnv } from '@/test/helpers'

async function makeBlobRoot() {
  return mkdtemp(join(tmpdir(), 'serenique-blob-root-'))
}

describe('blob root initialization', () => {
  test('tolerates unrelated top-level files and creates a managed objects directory', async () => {
    setTestEnv()
    const { initBlobRoot } = await import('./storage')
    const root = await makeBlobRoot()
    await writeFile(join(root, '.DS_Store'), '')

    await initBlobRoot(root)

    const entries = await readdir(root)
    expect(entries).toContain('.DS_Store')
    expect(entries).toContain('objects')
  })

  test('stores and lists files under the managed objects directory only', async () => {
    setTestEnv()
    const { initBlobRoot, listStoragePaths, saveFile } = await import('./storage')
    const root = await makeBlobRoot()
    await initBlobRoot(root)
    await writeFile(join(root, '.DS_Store'), '')

    await saveFile(root, 'image/2026/08/blob.png', Buffer.from('new'))

    expect(await Bun.file(join(root, 'objects/image/2026/08/blob.png')).text()).toBe('new')
    expect(await listStoragePaths(root)).toEqual(['image/2026/08/blob.png'])
  })

  test('can still open legacy files stored directly under the old root layout', async () => {
    setTestEnv()
    const { initBlobRoot, openFileFromStorage } = await import('./storage')
    const root = await makeBlobRoot()
    await initBlobRoot(root)
    await mkdir(join(root, 'image/2026/08'), { recursive: true })
    await writeFile(join(root, 'image/2026/08/legacy.png'), 'legacy')

    const { body, size } = await openFileFromStorage(root, 'image/2026/08/legacy.png')

    expect(size).toBe(6)
    expect(await body.text()).toBe('legacy')
  })
})

describe('thumbnail helpers', () => {
  test('thumbnailStoragePath / stripThumbnailSuffix / isThumbnailPath round-trip', async () => {
    setTestEnv()
    const { isThumbnailPath, stripThumbnailSuffix, thumbnailStoragePath } = await import(
      './storage'
    )

    const key = 'image/2026/08/abc.png'
    const thumb = thumbnailStoragePath(key)
    expect(thumb).toBe('image/2026/08/abc.png.thumb.webp')
    expect(isThumbnailPath(thumb)).toBe(true)
    expect(isThumbnailPath(key)).toBe(false)
    expect(stripThumbnailSuffix(thumb)).toBe(key)
    expect(stripThumbnailSuffix(key)).toBeUndefined()
  })

  test('generateThumbnail：真实图片生成 512px 内 WebP，非图片返回 null', async () => {
    setTestEnv()
    const { generateThumbnail } = await import('./storage')

    // 一张 1200x800 SVG → PNG（sharp 驱动）
    const { default: sharp } = await import('sharp')
    const svg = Buffer.from(
      `<svg width="1200" height="800"><rect width="1200" height="800" fill="#4f86f7"/></svg>`,
    )
    const png = await sharp(svg).png().toBuffer()

    const thumb = await generateThumbnail(png)
    expect(thumb).not.toBeNull()
    const meta = await sharp(thumb!).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBeLessThanOrEqual(512)

    // 非图片（随机字节）→ null 而非抛错
    expect(await generateThumbnail(Buffer.from('not an image at all'))).toBeNull()
  })
})
