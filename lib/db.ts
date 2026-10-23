import { Prisma } from "@prisma/client";
import { rawDb } from "./db-base";
import { tenantExtension, lc } from "./tenant";
import { recordEvent, requestStore, SLOW_QUERY_MS } from "./ops";

/** Times every query: feeds the per-request db counters and records slow or failed ones. */
const metrics = Prisma.defineExtension({
  name: "query-metrics",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const t0 = performance.now();
        let ok = true;
        try {
          return await query(args);
        } catch (e) {
          ok = false;
          throw e;
        } finally {
          const ms = Math.round(performance.now() - t0);
          const store = requestStore.getStore();
          if (store) {
            store.dbCount += 1;
            store.dbMs += ms;
          }
          if (!ok || ms >= SLOW_QUERY_MS) {
            recordEvent({ kind: "db", name: `${lc(model)}.${operation}`, ok, ms, organizationId: store?.orgId });
          }
        }
      },
    },
  },
});

/** The app's database client: tenant-scoped (see lib/tenant.ts) and instrumented. */
export const db = rawDb.$extends(metrics).$extends(tenantExtension(rawDb));

/** What `db.$transaction(async (tx) => ...)` hands its callback. */
export type DbTx = Omit<typeof db, "$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;
