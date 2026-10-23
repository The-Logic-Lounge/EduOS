import { currentOrgId } from "./tenant";
import { newCorrelationId, recordEvent, requestStore } from "./ops";

/**
 * Wraps an App Router handler so every API request is measured: status, latency, and
 * how many Prisma queries it ran and how long they took (filled in by lib/db.ts).
 * `name` is the route template ("/api/students/[id]"), never the concrete URL, so
 * dashboard labels stay bounded and ids never reach telemetry.
 */
export function route<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const store = { correlationId: newCorrelationId(), dbCount: 0, dbMs: 0 };
    const t0 = performance.now();
    let status = 500;
    try {
      const res = await requestStore.run(store, () => handler(...args));
      status = res.status;
      res.headers.set("x-correlation-id", store.correlationId);
      return res;
    } finally {
      const method = args[0] instanceof Request ? args[0].method : "GET";
      const orgId = await currentOrgId().catch(() => null);
      recordEvent({
        kind: "http",
        name: `${method} ${name}`,
        ok: status < 500,
        status,
        ms: Math.round(performance.now() - t0),
        dbCount: store.dbCount,
        dbMs: Math.round(store.dbMs),
        organizationId: orgId,
        correlationId: store.correlationId,
      });
    }
  };
}
