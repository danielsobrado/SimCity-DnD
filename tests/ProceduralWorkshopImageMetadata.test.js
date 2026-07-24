import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkshopImageDimensions } from '../src/editor/workshop/ProceduralWorkshopImageMetadata.js';

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpegHeader(width, height) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x11,
    0x08,
    height >> 8, height & 0xff,
    width >> 8, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
}

function webpExtendedHeader(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x16, 0x00, 0x00, 0x00], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  bytes.set([0x0a, 0x00, 0x00, 0x00], 16);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes.set([
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
  ], 24);
  bytes.set([
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ], 27);
  return bytes;
}

test('workshop image metadata reads PNG, JPEG, and WebP dimensions', () => {
  assert.deepEqual(parseWorkshopImageDimensions(pngHeader(1024, 512), 'image/png'), {
    width: 1024,
    height: 512,
  });
  assert.deepEqual(parseWorkshopImageDimensions(jpegHeader(640, 480), 'image/jpeg'), {
    width: 640,
    height: 480,
  });
  assert.deepEqual(parseWorkshopImageDimensions(webpExtendedHeader(2048, 1024), 'image/webp'), {
    width: 2048,
    height: 1024,
  });
});

test('workshop image metadata rejects corrupt and oversized image headers', () => {
  assert.throws(
    () => parseWorkshopImageDimensions(new Uint8Array(24), 'image/png'),
    /not a valid PNG/,
  );
  assert.throws(
    () => parseWorkshopImageDimensions(pngHeader(4097, 512), 'image/png'),
    /no larger than 4096 × 4096/,
  );
  assert.throws(
    () => parseWorkshopImageDimensions(pngHeader(4096, 4097), 'image/png'),
    /no larger than 4096 × 4096/,
  );
});
