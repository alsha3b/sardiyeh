// Minimal zero-dependency .xlsx reader: ZIP central directory + inflateRaw +
// regex XML scan. Enough to pull sheet names and cell text out of an Office Open
// XML workbook, which is all `seed-from-xlsx.mjs` needs — deliberately avoids
// adding a spreadsheet library to a repo that otherwise ships no bundler.
//
// Not a general xlsx implementation: it ignores styles (so date cells come back
// as raw serial numbers), formulas (cached <v> values are used), and charts.
const { readFileSync } = require("node:fs");
const { inflateRawSync } = require("node:zlib");

function unzip(path) {
  const buf = readFileSync(path);
  // End of central directory record (scan back for signature 0x06054b50)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip");
  let count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  // Zip64 fallback
  if (off === 0xffffffff || count === 0xffff) {
    const locOff = eocd - 20;
    const z64 = Number(buf.readBigUInt64LE(locOff + 8));
    count = Number(buf.readBigUInt64LE(z64 + 32));
    off = Number(buf.readBigUInt64LE(z64 + 48));
  }
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    let lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (lho === 0xffffffff) {
      // read zip64 extra field for local header offset
      let e = off + 46 + nameLen;
      const end = e + extraLen;
      while (e < end) {
        const id = buf.readUInt16LE(e), sz = buf.readUInt16LE(e + 2);
        if (id === 0x0001) { lho = Number(buf.readBigUInt64LE(e + 4 + (csize === 0xffffffff ? 8 : 0))); }
        e += 4 + sz;
      }
    }
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s) =>
  s.replace(/&(?:amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (m) =>
    ENT[m] ?? String.fromCodePoint(parseInt(m[2] === "x" ? m.slice(3, -1) : m.slice(2, -1), m[2] === "x" ? 16 : 10))
  );

function sharedStrings(files) {
  const xml = files.get("xl/sharedStrings.xml");
  if (!xml) return [];
  const s = xml.toString("utf8");
  const out = [];
  for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += decode(t[1]);
    out.push(text);
  }
  return out;
}

function workbookSheets(files) {
  const wb = files.get("xl/workbook.xml").toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels").toString("utf8");
  const relMap = new Map();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2].replace(/^\/?(xl\/)?/, "xl/"));
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet[^>]*\/>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const state = /state="([^"]*)"/.exec(m[0])?.[1] ?? "visible";
    sheets.push({ name, state, path: relMap.get(rid) });
  }
  return sheets;
}

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

function sheetRows(files, path, sst) {
  const xml = files.get(path)?.toString("utf8");
  if (!xml) return [];
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let v;
      if (type === "inlineStr") {
        v = "";
        for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) v += decode(t[1]);
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw == null) v = "";
        else if (type === "s") v = sst[Number(raw)] ?? "";
        else v = decode(raw);
      }
      const idx = ref ? colIndex(ref) : cells.length;
      cells[idx] = typeof v === "string" ? v : String(v);
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

function readWorkbook(path) {
  const files = unzip(path);
  const sst = sharedStrings(files);
  return workbookSheets(files).map((s) => ({ ...s, rows: sheetRows(files, s.path, sst) }));
}

module.exports = {
  unzip,
  sharedStrings,
  workbookSheets,
  sheetRows,
  readWorkbook,
};
