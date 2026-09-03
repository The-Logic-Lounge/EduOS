import AppShell from "@/components/app/AppShell";
import { requireSession } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  return <AppShell user={user}>{children}</AppShell>;
}
