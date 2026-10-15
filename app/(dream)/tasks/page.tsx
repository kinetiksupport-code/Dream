import type { Metadata } from "next";
import { TasksView } from "@/components/tasks-view";
export const metadata: Metadata = { title: "Tareas" };
export default function Tasks() {
  return <TasksView />;
}
