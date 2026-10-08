import { ExamStudy } from "@/components/exams/exam-study";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = await params;
  return <ExamStudy id={id} unitId={unitId} />;
}
