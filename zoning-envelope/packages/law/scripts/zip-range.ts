/**
 * Minimal reader for a remote zip (including zip64) over HTTP range requests.
 * It fetches the central directory once, then only the entries asked for, so a
 * 1.3 GB archive can be read for a few megabytes.
 */
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly offset: number;
}

export interface RemoteZip {
  readonly url: string;
  readonly size: number;
  readonly lastModified: string | null;
  readonly entries: ReadonlyMap<string, ZipEntry>;
}

async function range(url: string, start: number, end: number): Promise<Buffer> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) throw new Error(`Range request failed: HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function openRemoteZip(url: string): Promise<RemoteZip> {
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`HEAD failed: HTTP ${head.status} for ${url}`);
  const size = Number(head.headers.get('content-length'));
  const lastModified = head.headers.get('last-modified');

  const tailLength = Math.min(size, 65_536 + 22 + 20 + 56);
  const tail = await range(url, size - tailLength, size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('End of central directory not found');
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  const zip64 = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
  if (cdOffset === 0xffffffff && zip64 >= 0) {
    cdSize = Number(tail.readBigUInt64LE(zip64 + 40));
    cdOffset = Number(tail.readBigUInt64LE(zip64 + 48));
  }

  const cd = await range(url, cdOffset, cdOffset + cdSize - 1);
  const entries = new Map<string, ZipEntry>();
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const method = cd.readUInt16LE(p + 10);
    let compressedSize = cd.readUInt32LE(p + 20);
    let uncompressedSize = cd.readUInt32LE(p + 24);
    const nameLength = cd.readUInt16LE(p + 28);
    const extraLength = cd.readUInt16LE(p + 30);
    const commentLength = cd.readUInt16LE(p + 32);
    let offset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLength);

    // The zip64 extra field holds whichever of the three sizes overflowed, in this order.
    const extra = cd.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength);
    for (let q = 0; q + 4 <= extra.length; ) {
      const id = extra.readUInt16LE(q);
      const len = extra.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let k = q + 4;
        if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(extra.readBigUInt64LE(k)); k += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = Number(extra.readBigUInt64LE(k)); k += 8; }
        if (offset === 0xffffffff) { offset = Number(extra.readBigUInt64LE(k)); k += 8; }
      }
      q += 4 + len;
    }

    entries.set(name, { name, method, compressedSize, offset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { url, size, lastModified, entries };
}

export async function readEntry(zip: RemoteZip, name: string): Promise<Buffer> {
  const entry = zip.entries.get(name);
  if (!entry) throw new Error(`No entry named ${name} in ${zip.url}`);
  const header = await range(zip.url, entry.offset, entry.offset + 29);
  const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = await range(zip.url, start, start + entry.compressedSize - 1);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported compression method ${entry.method} for ${name}`);
}
