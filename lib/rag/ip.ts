import { isIP, type LookupFunction } from "node:net";
import { lookup } from "node:dns";

function v4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // this-net, private, loopback, multicast 224/4, reserved 240/4 + broadcast
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT (incl. Alibaba metadata 100.100.100.200)
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
    (a === 192 && b === 0 && ip.split(".")[2] === "0") // IETF protocol assignments 192.0.0/24
  );
}

/** Expand an IPv6 literal to 8 16-bit words; a trailing dotted IPv4 becomes the last two. */
function v6Words(ip: string): number[] {
  let s = ip.split("%")[0].toLowerCase();
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail[1].split(".").map(Number);
    s = s.slice(0, -tail[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [];
  const r = rest !== undefined && rest ? rest.split(":") : [];
  const fill = rest !== undefined ? Array(8 - h.length - r.length).fill("0") : [];
  return [...h, ...fill, ...r].map((w) => parseInt(w, 16));
}

/**
 * True when an address must never be fetched server-side: private, loopback, link-local,
 * CGNAT, unspecified, multicast, metadata, or anything that is not a valid IP at all.
 */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip.split("%")[0]);
  if (kind === 4) return v4Blocked(ip);
  if (kind !== 6) return true;
  const w = v6Words(ip);
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0xffff || w[5] === 0)) {
    // ::ffff:a.b.c.d (mapped), ::a.b.c.d (compat), :: and ::1
    if (w[5] === 0 && w[6] === 0 && w[7] <= 1) return true;
    return v4Blocked(v4(w[6], w[7]));
  }
  // Forms that carry an IPv4 address the network may translate and reach:
  // ::ffff:0:a.b.c.d (translated), 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64), 2002::/16 (6to4).
  if (w.slice(0, 4).every((x) => x === 0) && w[4] === 0xffff && w[5] === 0) return v4Blocked(v4(w[6], w[7]));
  if (w[0] === 0x64 && w[1] === 0xff9b) return true;
  if (w[0] === 0x2002) return v4Blocked(v4(w[1], w[2]));
  return (
    (w[0] & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (w[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (w[0] & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
    (w[0] & 0xff00) === 0xff00 // multicast
  );
}

/**
 * dns.lookup that fails with Error("blocked_url") when any resolved address is blocked. Passed as the
 * socket's `lookup`, so the check runs on the exact address the connection uses (no rebinding gap).
 */
export const safeLookup: LookupFunction = (hostname, options, callback) =>
  lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const list = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (list.length === 0 || list.some(isBlockedAddress)) return callback(new Error("blocked_url"), "", 0);
    callback(null, address, family);
  });
