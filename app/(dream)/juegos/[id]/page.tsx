import type { Metadata } from "next";
import { GamePage } from "@/components/dreams/game-page";

export const metadata: Metadata = { title: "Juego" };

export default async function GameRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GamePage id={id} />;
}
