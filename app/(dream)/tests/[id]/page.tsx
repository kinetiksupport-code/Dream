import { TestExperience } from "@/components/test-experience";
export default async function TestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TestExperience id={id} />;
}
