import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20 text-2xl">
            🔒
          </div>
          <h1 className="text-2xl font-semibold text-white">Personal Agent</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Private access only. Enter your access code to continue.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
