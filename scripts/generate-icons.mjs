import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

const rootDir = path.resolve(import.meta.dirname, '..')
const sourceSvg = path.join(rootDir, 'public', 'tutin-icon.svg')
const buildDir = path.join(rootDir, 'build')
const pngPath = path.join(buildDir, 'icon.png')
const icoPath = path.join(buildDir, 'icon.ico')
const iconSizes = [16, 24, 32, 48, 64, 128, 256]

const createBitmapIconFrame = async (svg, size) => {
    const rgba = await sharp(svg)
        .resize(size, size)
        .ensureAlpha()
        .raw()
        .toBuffer()

    const xorStride = size * 4
    const maskStride = Math.ceil(size / 32) * 4
    const dibSize = 40 + xorStride * size + maskStride * size
    const frame = Buffer.alloc(dibSize)

    frame.writeUInt32LE(40, 0)
    frame.writeInt32LE(size, 4)
    frame.writeInt32LE(size * 2, 8)
    frame.writeUInt16LE(1, 12)
    frame.writeUInt16LE(32, 14)
    frame.writeUInt32LE(0, 16)
    frame.writeUInt32LE(xorStride * size, 20)

    let offset = 40
    for (let y = size - 1; y >= 0; y -= 1) {
        for (let x = 0; x < size; x += 1) {
            const source = (y * size + x) * 4
            frame[offset++] = rgba[source + 2]
            frame[offset++] = rgba[source + 1]
            frame[offset++] = rgba[source]
            frame[offset++] = rgba[source + 3]
        }
    }

    return frame
}

const createIco = async (svg) => {
    const frames = await Promise.all(iconSizes.map((size) => createBitmapIconFrame(svg, size)))
    const headerSize = 6
    const entrySize = 16
    const directorySize = headerSize + entrySize * frames.length
    const totalSize = directorySize + frames.reduce((sum, frame) => sum + frame.length, 0)
    const ico = Buffer.alloc(totalSize)

    ico.writeUInt16LE(0, 0)
    ico.writeUInt16LE(1, 2)
    ico.writeUInt16LE(frames.length, 4)

    let imageOffset = directorySize
    frames.forEach((frame, index) => {
        const size = iconSizes[index]
        const entryOffset = headerSize + entrySize * index
        ico[entryOffset] = size === 256 ? 0 : size
        ico[entryOffset + 1] = size === 256 ? 0 : size
        ico[entryOffset + 2] = 0
        ico[entryOffset + 3] = 0
        ico.writeUInt16LE(1, entryOffset + 4)
        ico.writeUInt16LE(32, entryOffset + 6)
        ico.writeUInt32LE(frame.length, entryOffset + 8)
        ico.writeUInt32LE(imageOffset, entryOffset + 12)
        frame.copy(ico, imageOffset)
        imageOffset += frame.length
    })

    return ico
}

await fs.mkdir(buildDir, { recursive: true })

const svg = await fs.readFile(sourceSvg)
await sharp(svg)
    .resize(512, 512)
    .png()
    .toFile(pngPath)

const ico = await createIco(svg)
await fs.writeFile(icoPath, ico)

console.log(`Generated ${path.relative(rootDir, icoPath)}`)
