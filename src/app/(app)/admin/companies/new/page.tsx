import { CompanyForm } from "@/components/admin";
import { SectionCard } from "@/components/ui";

export const metadata = { title: "Admin · New company" };

export default function NewCompany() {
  return (
    <SectionCard title="Add company" subtitle="Validated, normalised and checked for duplicates (tax code or name + province). Score is calculated on save.">
      <CompanyForm />
    </SectionCard>
  );
}
