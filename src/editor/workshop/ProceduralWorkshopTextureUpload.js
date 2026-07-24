import { parseWorkshopImageDimensions } from './ProceduralWorkshopImageMetadata.js';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 512;
const OUTPUT_TYPE = 'image/webp';
const OUTPUT_QUALITY = 0.88;
const VALID_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      image,
      close() {
        URL.revokeObjectURL(url);
      },
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected albedo image could not be decoded.'));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        close() {
          bitmap.close();
        },
      };
    } catch {
      return loadImageElement(file);
    }
  }
  return loadImageElement(file);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The processed albedo image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareWorkshopAlbedo(file) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new Error('Choose an albedo image first.');
  }
  if (!VALID_UPLOAD_TYPES.has(file.type)) {
    throw new Error('Use a PNG, JPEG, or WebP image for albedo.');
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('The source albedo image must be smaller than 8 MB.');
  }

  const sourceDimensions = parseWorkshopImageDimensions(await file.arrayBuffer(), file.type);
  const decoded = await decodeImage(file);
  try {
    const decodedWidth = decoded.image.naturalWidth ?? decoded.image.width;
    const decodedHeight = decoded.image.naturalHeight ?? decoded.image.height;
    if (decodedWidth !== sourceDimensions.width || decodedHeight !== sourceDimensions.height) {
      throw new Error('The decoded albedo dimensions do not match its image header.');
    }

    const cropSize = Math.min(decodedWidth, decodedHeight);
    const sourceX = (decodedWidth - cropSize) / 2;
    const sourceY = (decodedHeight - cropSize) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    let context;
    try {
      context = canvas.getContext('2d', {
        alpha: false,
        colorSpace: 'srgb',
      });
    } catch {
      context = null;
    }
    context ??= canvas.getContext('2d', { alpha: false });
    context ??= canvas.getContext('2d');
    if (!context) {
      throw new Error('The browser could not prepare the albedo texture.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      decoded.image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    const blob = await canvasToBlob(canvas, OUTPUT_TYPE, OUTPUT_QUALITY)
      ?? await canvasToBlob(canvas, 'image/png');
    if (!blob) {
      throw new Error('The browser could not encode the albedo texture.');
    }

    return Object.freeze({
      name: file.name,
      dataUrl: await blobToDataUrl(blob),
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
    });
  } finally {
    decoded.close();
  }
}
