import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { isPlatformAdmin } from "@/lib/platform";
import PageHeader from "@/components/ui/PageHeader";
import SystemHealth from "./SystemHealth";

export const dynamic = "force-dynamic";

export const metadata = { title: "System Health" };

export default async function SystemHealthPage() {
  const user = await requirePageRole("MANAGEMENT");
  // Institute admins are not platform operators: the page does not exist for them.
  if (!isPlatformAdmin(user)) notFound();
  return (
    <>
      <PageHeader
        title="System Health"
        subtitle="Live platform telemetry across every institute: API latency, database, AI provider, sign-ins and errors. Internal to EDUOS operators."
      />
      <SystemHealth />
    </>
  );
}
