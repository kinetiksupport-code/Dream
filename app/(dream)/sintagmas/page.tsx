import { Suspense } from "react";
import { SyntaxActivity } from "@/components/sintagmas/syntax-activity";
export default function Page() {
  return (
    <Suspense>
      <SyntaxActivity />
    </Suspense>
  );
}
