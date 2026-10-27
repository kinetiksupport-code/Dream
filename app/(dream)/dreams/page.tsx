import type { Metadata } from "next";
import { DreamsList } from "@/components/dreams/dreams-list";

export const metadata: Metadata = { title: "Dreams" };

export default function DreamsPage() {
  return <DreamsList />;
}
