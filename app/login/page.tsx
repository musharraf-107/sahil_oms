"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "info"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({
          type: "info",
          text: "Account created. Check your email to confirm, then sign in.",
        });
        setMode("signin");
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-amber to-[#C97A2B] flex items-center justify-center font-display font-bold text-[#1A1206] text-base">
            M
          </div>
          <div>
            <div className="font-display font-semibold text-lg">Manifest</div>
            <div className="text-[10px] uppercase tracking-wide text-muted2">Order &amp; RTO console</div>
          </div>
        </div>

        <div className="bg-panel border border-bordersoft rounded-xl p-6">
          <div className="flex gap-2 mb-6 bg-panel2 rounded-lg p-1">
            <button
              className={`flex-1 text-sm py-2 rounded-md font-medium transition ${
                mode === "signin" ? "bg-amber text-[#1A1206]" : "text-muted"
              }`}
              onClick={() => setMode("signin")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`flex-1 text-sm py-2 rounded-md font-medium transition ${
                mode === "signup" ? "bg-amber text-[#1A1206]" : "text-muted"
              }`}
              onClick={() => setMode("signup")}
              type="button"
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5 font-semibold">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-ink border border-bordersoft rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-amber"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5 font-semibold">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-ink border border-bordersoft rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-amber"
                placeholder="••••••••"
              />
            </div>

            {message && (
              <div
                className={`text-xs rounded-md px-3 py-2 ${
                  message.type === "error"
                    ? "bg-red/10 text-red border border-red/30"
                    : "bg-teal/10 text-teal border border-teal/30"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-amber text-[#1A1206] font-semibold text-sm rounded-md py-2.5 hover:brightness-110 transition disabled:opacity-60"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted2 mt-5">
          Your orders are private to your account, secured by Supabase auth.
        </p>
      </div>
    </div>
  );
}
