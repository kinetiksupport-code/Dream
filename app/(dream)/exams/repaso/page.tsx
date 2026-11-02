import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CardsReviewPage } from "@/components/cards/cards-review-page";
import { studyStepsEnabled } from "@/lib/study-steps";

// Repaso de hoy (Bloque 4): las tarjetas que tocan, de todos los exámenes.
export default function Page() {
  if (!studyStepsEnabled()) notFound();
  return (
    <Suspense>
      <CardsReviewPage />
    </Suspense>
  );
}
