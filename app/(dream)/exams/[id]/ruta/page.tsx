import { ExamPath } from "@/components/exams/exam-path";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamPath id={id} />;
}
