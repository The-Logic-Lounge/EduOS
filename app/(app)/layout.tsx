import AppShell from "@/components/app/AppShell";
import { requireSession } from "@/lib/page-auth";
import { isPlatformAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  return <AppShell user={user} showSystem={isPlatformAdmin(user)}>{children}</AppShell>;
}
