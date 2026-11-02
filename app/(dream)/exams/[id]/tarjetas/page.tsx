import { notFound } from "next/navigation";
import { ExamCards } from "@/components/cards/exam-cards";
import { studyStepsEnabled } from "@/lib/study-steps";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!studyStepsEnabled()) notFound();
  const { id } = await params;
  return <ExamCards examId={id} />;
}
