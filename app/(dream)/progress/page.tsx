import type { Metadata } from "next";
import { ProgressView } from "@/components/progress/progress-view";
export const metadata: Metadata = { title: "Progreso" };
export default function Progress() {
  return <ProgressView />;
}
