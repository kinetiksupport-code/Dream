import type { Metadata } from "next";
import { NotesView } from "@/components/notes-view";
export const metadata: Metadata = { title: "Apuntes" };
export default function Notes() {
  return <NotesView />;
}
