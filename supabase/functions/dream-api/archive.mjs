// Validate the central directory before any decompression. Reject ZIP64, encryption and ambiguous offsets.
export function validateOfficeArchive(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (
      v.getUint32(p, true) === 0x06054b50 &&
      p + 22 + v.getUint16(p + 20, true) === bytes.length
    ) {
      e = p;
      break;
    }
  if (e < 0 || v.getUint16(e + 4, true) || v.getUint16(e + 6, true))
    throw new Error("invalid_archive");
  const count = v.getUint16(e + 10, true),
    size = v.getUint32(e + 12, true),
    start = v.getUint32(e + 16, true);
  if (
    count > 2048 ||
    count === 65535 ||
    v.getUint16(e + 8, true) !== count ||
    start + size !== e
  )
    throw new Error("archive_limits");
  let p = start,
    total = 0;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (p + 46 > e || v.getUint32(p, true) !== 0x02014b50)
      throw new Error("invalid_archive");
    const compressed = v.getUint32(p + 20, true),
      expanded = v.getUint32(p + 24, true),
      length = v.getUint16(p + 28, true),
      extra = v.getUint16(p + 30, true),
      comment = v.getUint16(p + 32, true),
      offset = v.getUint32(p + 42, true);
    const next = p + 46 + length + extra + comment;
    if (
      next > e ||
      offset + 30 > start ||
      v.getUint16(p + 8, true) & 1 ||
      ![0, 8].includes(v.getUint16(p + 10, true)) ||
      expanded > 4 * 1024 * 1024 ||
      expanded > Math.max(1024 * 1024, compressed * 100) ||
      offset === 0xffffffff
    )
      throw new Error("archive_limits");
    if (
      v.getUint32(offset, true) !== 0x04034b50 ||
      v.getUint16(offset + 6, true) !== v.getUint16(p + 8, true) ||
      v.getUint16(offset + 8, true) !== v.getUint16(p + 10, true)
    )
      throw new Error("invalid_archive");
    const localLength = v.getUint16(offset + 26, true),
      localExtra = v.getUint16(offset + 28, true);
    if (
      offset + 30 + localLength + localExtra + compressed > start ||
      localLength !== length
    )
      throw new Error("invalid_archive");
    const rawName = bytes.subarray(p + 46, p + 46 + length),
      localName = bytes.subarray(offset + 30, offset + 30 + localLength);
    if (!rawName.every((b, i) => localName[i] === b))
      throw new Error("invalid_archive");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(rawName);
    if (
      names.has(name) ||
      name.includes("..") ||
      name.includes("\\") ||
      name.startsWith("/")
    )
      throw new Error("invalid_archive");
    names.add(name);
    total += expanded;
    if (total > 16 * 1024 * 1024) throw new Error("archive_limits");
    p = next;
  }
  if (p !== e) throw new Error("invalid_archive");
  return { entries: count, expandedBytes: total };
}
export function assertBase64(value) {
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("invalid_base64");
}
