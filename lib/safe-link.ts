/** True only for an in-app relative path: "/x", never "//host", a backslash, or whitespace/control
 *  chars (browsers strip tab/newline, so "/\t/evil.com" would become "//evil.com"). Shared by the
 *  notifications API and NotificationBell, so a stored link can never navigate off-site. */
export function isInAppPath(link: string): boolean {
  if (!(link.length <= 300 && link.startsWith("/") && !link.startsWith("//") && !/[\\\s\x00-\x1f\x7f]/.test(link))) {
    return false;
  }
  // "/.//evil.com" passes the raw checks but normalises to "//evil.com": judge the resolved path too.
  const u = new URL(link, "http://in-app.invalid");
  return u.origin === "http://in-app.invalid" && !u.pathname.startsWith("//");
}
