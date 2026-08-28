import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateDealForm } from "@/components/CreateDealForm";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getSession } from "@/lib/auth";

export default async function NewDealPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <Navbar user={session} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href="/dashboard" className="text-sm text-teal-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">Create a new deal</h1>
        <p className="mt-2 text-slate-600">
          Choose a deal type and generate a secure payment link for your buyer.
        </p>
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <CreateDealForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
