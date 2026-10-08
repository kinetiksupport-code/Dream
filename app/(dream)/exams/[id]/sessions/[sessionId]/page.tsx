import { ExamSessionView } from "@/components/exams/exam-session";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  return <ExamSessionView id={id} sessionId={sessionId} />;
}
