import { Suspense } from "react";
import { StudyGate } from "@/components/study-gate";
import { CardsReviewPage } from "@/components/cards/cards-review-page";

// Repaso de hoy (Bloque 4): las tarjetas que tocan, de todos los exámenes.
export default function Page() {
  return (
    <StudyGate>
      <Suspense>
        <CardsReviewPage />
      </Suspense>
    </StudyGate>
  );
}
