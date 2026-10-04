import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Escáner de canales persistibles. Busca un marcador sintético en texto y archivos en sus formas habituales de codificación
 * (crudo, URL, hex, UTF-16, base64 en los tres alineamientos) y DENTRO de los zip embebidos: el reporte HTML de Playwright
 * guarda sus datos como un zip en base64 dentro de index.html, así que un `includes()` sobre el HTML no detectaría nada.
 */

/** Caracteres iniciales de la codificación base64 que dependen de los 0, 1 o 2 bytes previos al marcador (alineamientos). */
const BASE64_HEAD_DROP: readonly number[] = [0, 2, 3];

export function markerVariants(marker: string): readonly string[] {
  const bytes = Buffer.from(marker, 'utf8');
  const variants = new Set<string>([
    marker,
    encodeURIComponent(marker),
    bytes.toString('hex'),
    Buffer.from(marker, 'utf16le').toString('latin1'),
  ]);
  BASE64_HEAD_DROP.forEach((dropHead, offset) => {
    const encoded = Buffer.concat([Buffer.alloc(offset, 0x78), bytes]).toString('base64');
    variants.add(encoded.slice(dropHead, encoded.length - 3));
  });
  return [...variants];
}

export function containsMarker(content: Buffer | string, marker: string): boolean {
  const haystack = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const text = haystack.toString('latin1');
  return markerVariants(marker).some((variant) => text.includes(variant));
}

/** Entradas descomprimidas de un zip (método 0 y 8). Suficiente para el reporte HTML de Playwright. */
export function unzipEntries(zip: Buffer): readonly { readonly name: string; readonly data: Buffer }[] {
  let eocd = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 65_557); index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  const entries: { name: string; data: Buffer }[] = [];
  for (let n = 0; n < count; n += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = zip.subarray(start, start + compressedSize);
    entries.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const EMBEDDED_ZIP = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/g;

/** Contenidos «lógicos» de un archivo: él mismo y, si embebe zips en base64, el contenido descomprimido de cada entrada. */
export function logicalContents(file: Buffer): readonly { readonly label: string; readonly data: Buffer }[] {
  const contents: { label: string; data: Buffer }[] = [{ label: 'raw', data: file }];
  const text = file.toString('latin1');
  for (const match of text.matchAll(EMBEDDED_ZIP)) {
    const payload = match[1];
    if (payload === undefined) continue;
    for (const entry of unzipEntries(Buffer.from(payload, 'base64'))) {
      contents.push({ label: `embedded-zip:${entry.name}`, data: entry.data });
    }
  }
  if (file.length >= 4 && file.readUInt32LE(0) === 0x04034b50) {
    for (const entry of unzipEntries(file)) {
      contents.push({ label: `zip:${entry.name}`, data: entry.data });
    }
  }
  return contents;
}

export function walkFiles(directory: string): readonly string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, dirent.name);
    if (dirent.isDirectory()) files.push(...walkFiles(full));
    else files.push(full);
  }
  return files;
}

export interface MarkerHit {
  readonly marker: string;
  readonly where: string;
}

/** Marcadores hallados en cualquier archivo de `directory` (incluido el contenido de zips embebidos) y en `extraChannels`. */
export function scanForMarkers(
  directory: string,
  markers: readonly string[],
  extraChannels: Readonly<Record<string, string>> = {},
): readonly MarkerHit[] {
  const hits: MarkerHit[] = [];
  for (const file of walkFiles(directory)) {
    const relative = path.relative(directory, file);
    for (const marker of markers) {
      if (containsMarker(Buffer.from(relative), marker)) hits.push({ marker, where: `nombre de archivo ${relative}` });
    }
    for (const content of logicalContents(fs.readFileSync(file))) {
      for (const marker of markers) {
        if (containsMarker(content.data, marker)) hits.push({ marker, where: `${relative} [${content.label}]` });
      }
    }
  }
  for (const [channel, text] of Object.entries(extraChannels)) {
    for (const marker of markers) {
      if (containsMarker(text, marker)) hits.push({ marker, where: channel });
    }
  }
  return hits;
}
