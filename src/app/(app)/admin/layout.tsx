import { AdminNav } from "@/components/AdminNav";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
