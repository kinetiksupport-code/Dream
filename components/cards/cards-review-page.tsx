"use client";
import { useSearchParams } from "next/navigation";
import { CardReview } from "./card-review";

/** Vuelve a las tarjetas del examen desde el que se entró, o a Exámenes. */
export function CardsReviewPage() {
  const from = useSearchParams().get("desde");
  const back = from && /^[0-9a-f-]{36}$/i.test(from) ? `/exams/${from}/tarjetas` : "/exams";
  return <CardReview back={back} />;
}
