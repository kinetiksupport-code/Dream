import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronIcon,
  ExamsIcon,
  HistoryIcon,
  NotesIcon,
  SettingsIcon,
} from "@/components/icons";
export const metadata: Metadata = { title: "Más" };
/** Design: "Móvil · Más". Secondary destinations of the mobile tab bar. */
export default function More() {
  return (
    <div className="page page-settings">
      <h1 className="title">Más</h1>
      <ul className="group-list">
        <li>
          <Link className="group-row group-link press" href="/notes">
            <NotesIcon />
            <span>Apuntes</span>
            <ChevronIcon />
          </Link>
        </li>
        <li>
          <Link className="group-row group-link press" href="/exams">
            <ExamsIcon />
            <span>Exámenes</span>
            <ChevronIcon />
          </Link>
        </li>
        <li>
          <Link className="group-row group-link press" href="/chat?view=recent">
            <HistoryIcon />
            <span>Historial</span>
            <ChevronIcon />
          </Link>
        </li>
      </ul>
      <ul className="group-list">
        <li>
          <Link className="group-row group-link press" href="/settings">
            <SettingsIcon />
            <span>Ajustes</span>
            <ChevronIcon />
          </Link>
        </li>
      </ul>
    </div>
  );
}
