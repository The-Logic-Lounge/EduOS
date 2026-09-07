import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-paper px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Link href="/" className="group">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-2">
          <Link href="/" className="transition-colors hover:text-ink">
            Home
          </Link>
          <Link href="/#courses" className="transition-colors hover:text-ink">
            Courses
          </Link>
          <Link href="/#contact" className="transition-colors hover:text-ink">
            Contact
          </Link>
          <Link href="/login" className="transition-colors hover:text-ink">
            Login
          </Link>
        </nav>
        <p className="text-center text-xs text-ink-3 sm:text-right">
          &copy; {new Date().getFullYear()} Edu OS. Free IT training for Pakistan.
        </p>
      </div>
    </footer>
  );
}
