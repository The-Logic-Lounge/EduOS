import { PublicNavbar } from "./PublicNavbar";
import { Footer } from "./Footer";

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-screen flex-col bg-paper text-ink">
      <PublicNavbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
