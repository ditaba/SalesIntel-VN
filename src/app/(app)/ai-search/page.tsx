import { Suspense } from "react";
import { AISearch } from "@/components/AISearch";

export const metadata = { title: "AI Search" };

export default function AISearchPage() {
  return (
    <Suspense>
      <AISearch />
    </Suspense>
  );
}
