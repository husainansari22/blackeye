import { redirect } from "next/navigation";
import { AppHeader, AppShell } from "@/components/AppShell";
import { CreateDealForm } from "@/components/CreateDealForm";
import { getSession } from "@/lib/auth";

export default async function NewDealPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell showNav user={session}>
      <AppHeader title="New deal" subtitle="3 quick steps" backHref="/dashboard" />
      <main className="relative px-5 pb-8">
        <CreateDealForm />
      </main>
    </AppShell>
  );
}
