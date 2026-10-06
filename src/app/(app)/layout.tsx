import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { AI_MODEL, llmEnabled } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} aiMode={llmEnabled() ? `Claude (${AI_MODEL})` : "Rules engine (no API key)"}>
      {children}
    </AppShell>
  );
}
