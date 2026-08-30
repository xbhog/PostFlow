import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sizes = [16, 24, 32, 48, 64, 128, 256];
const svgPath = path.resolve('build/icon.svg');
const pngPath = path.resolve('build/icon.png');
const icoPath = path.resolve('build/icon.ico');

function encodeIco(images) {
  const headerSize = 6 + 16 * images.length;
  const payloadSize = images.reduce((sum, image) => sum + image.buffer.length, 0);
  const out = Buffer.alloc(headerSize + payloadSize);

  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    out.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    out.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    out.writeUInt8(0, entry + 2);
    out.writeUInt8(0, entry + 3);
    out.writeUInt16LE(1, entry + 4);
    out.writeUInt16LE(32, entry + 6);
    out.writeUInt32LE(image.buffer.length, entry + 8);
    out.writeUInt32LE(offset, entry + 12);
    image.buffer.copy(out, offset);
    offset += image.buffer.length;
  });

  return out;
}

await mkdir(path.resolve('build'), { recursive: true });

const master = sharp(svgPath, { density: 384 }).png();
await master.clone().resize(1024, 1024).png().toFile(pngPath);

const images = await Promise.all(sizes.map(async (size) => ({
  size,
  buffer: await master.clone().resize(size, size).png().toBuffer()
})));

await writeFile(icoPath, encodeIco(images));
console.log(`Wrote ${pngPath} and ${icoPath}`);
