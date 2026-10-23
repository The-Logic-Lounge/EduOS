import { describe, expect, it } from "vitest";
import { isBlockedAddress, safeLookup } from "./ip";

describe("isBlockedAddress", () => {
  it.each([
    "10.0.0.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "100.64.0.1", "100.100.100.200", "224.0.0.1", "239.255.255.250", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%en0", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::127.0.0.1",
    "not-an-ip", "", "999.1.1.1",
    "198.18.0.1", "198.19.255.255", "192.0.0.8", "64:ff9b::a9fe:a9fe", "64:ff9b::a00:1",
    "64:ff9b:1::1", "2002:7f00:1::", "2002:a9fe:a9fe::1", "::ffff:0:7f00:1", "fec0::1",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each([
    "8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "192.169.0.1",
    "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "::ffff:808:808",
  ])("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));
});

describe("safeLookup", () => {
  const run = (host: string, all: boolean) =>
    new Promise<unknown>((resolve, reject) =>
      safeLookup(host, { all }, (err, address) => (err ? reject(err) : resolve(address))),
    );

  it.each([true, false])("rejects a hostname resolving to loopback (all=%s)", async (all) => {
    await expect(run("localhost", all)).rejects.toThrow("blocked_url");
  });
});
