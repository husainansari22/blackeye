import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { PLATFORM_NAME } from "@/lib/constants";

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
        <Link href="/" className="mb-6 text-sm text-teal-700 hover:underline">
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-2 text-slate-600">Log in to your {PLATFORM_NAME} account</p>
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <AuthForm mode="login" />
        </div>
      </main>
      <Footer />
    </>
  );
}
