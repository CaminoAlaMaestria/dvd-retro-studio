/* ============================================================
   ZIP mínimo sin compresión (STORED).
   Los medios (MP4, JPG, MP3…) ya vienen comprimidos, así que
   guardarlos tal cual apenas aumenta el tamaño y permite
   leer/escribir el ZIP sin dependencias externas.
   ============================================================ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (v) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
};
const u32 = (v) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
};
const concat = (parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** files: [{ name: string, data: Uint8Array }] → Uint8Array (ZIP) */
export function createZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (u8) => {
    chunks.push(u8);
    offset += u8.length;
  };
  // Fecha DOS fija (2024-01-01) para paquetes estables
  const dosTime = 0;
  const dosDate = ((2024 - 1980) << 9) | (1 << 5) | 1;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const localOffset = offset;
    push(new Uint8Array([0x50, 0x4b, 0x03, 0x04])); // PK\x03\x04
    push(u16(20)); // versión
    push(u16(0x0800)); // flags: nombre UTF-8
    push(u16(0)); // método STORED
    push(u16(dosTime));
    push(u16(dosDate));
    push(u32(crc));
    push(u32(f.data.length)); // comprimido = original (STORED)
    push(u32(f.data.length));
    push(u16(name.length));
    push(u16(0)); // extra
    push(name);
    push(f.data);
    central.push({ name, crc, size: f.data.length, localOffset });
  }

  const centralStart = offset;
  for (const c of central) {
    push(new Uint8Array([0x50, 0x4b, 0x01, 0x02])); // PK\x01\x02
    push(u16(20)); // versión creador
    push(u16(20)); // versión necesaria
    push(u16(0x0800));
    push(u16(0));
    push(u16(dosTime));
    push(u16(dosDate));
    push(u32(c.crc));
    push(u32(c.size));
    push(u32(c.size));
    push(u16(c.name.length));
    push(u16(0)); // extra
    push(u16(0)); // comentario
    push(u16(0)); // disco
    push(u16(0)); // atributos internos
    push(u32(0)); // atributos externos
    push(u32(c.localOffset));
    push(c.name);
  }
  const centralSize = offset - centralStart;

  push(new Uint8Array([0x50, 0x4b, 0x05, 0x06])); // PK\x05\x06
  push(u16(0));
  push(u16(0));
  push(u16(central.length));
  push(u16(central.length));
  push(u32(centralSize));
  push(u32(centralStart));
  push(u16(0)); // comentario

  return concat(chunks);
}

/** Lee un ZIP con entradas STORED → [{ name, data: Uint8Array }] */
export async function readZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Localizar el registro final (EOCD) escaneando desde el final
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("No es un archivo ZIP válido");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (!(buf[off] === 0x50 && buf[off + 1] === 0x4b && buf[off + 2] === 0x01 && buf[off + 3] === 0x02)) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = dec.decode(buf.slice(off + 46, off + 46 + nameLen));
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    if (method !== 0) {
      throw new Error("Este ZIP usa compresión estándar. Para importar, usa el ZIP exportado por DVD Retro Studio o los archivos sueltos.");
    }
    if (!name.endsWith("/")) out.push({ name, data: buf.slice(dataStart, dataStart + compSize) });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
