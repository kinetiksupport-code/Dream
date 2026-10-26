"use client";
// A next/link that makes the Orb travel to the login (lib/orb-transition.ts).
// Modified clicks (new tab, etc.) and browsers without View Transitions keep
// the normal link behaviour.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { travelWithOrb } from "@/lib/orb-transition";

export function OrbLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  function click(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (travelWithOrb(() => router.push(href))) e.preventDefault();
  }
  return <Link href={href} onClick={click} {...props} />;
}
