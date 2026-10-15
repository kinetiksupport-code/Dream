"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_LINKS } from "@/lib/legal";

/** The four legal pages, marking the current one. Used in every footer. */
export function LegalLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Legal" className={className}>
      {LEGAL_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
