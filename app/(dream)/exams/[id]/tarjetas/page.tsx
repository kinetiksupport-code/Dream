import { StudyGate } from "@/components/study-gate";
import { ExamCards } from "@/components/cards/exam-cards";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StudyGate>
      <ExamCards examId={id} />
    </StudyGate>
  );
}
