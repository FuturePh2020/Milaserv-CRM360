"use client";

import Image from "next/image";
import { useState } from "react";
import { apiUrl } from "../../lib/api-client";
import { homePathForRole, saveSession } from "../../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message ?? "Login failed.");
      }
      saveSession(body.accessToken, body.user);
      window.location.href = homePathForRole(body.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image src="/logo.jpg" alt="Milaserv" width={96} height={96} className="rounded-card" priority />
        </div>
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-card border border-border bg-white p-8 shadow-sm"
          aria-label="Sign in"
        >
          <h1 className="mb-6 text-xl font-semibold text-navy">Sign in to Milaserv CRM360</h1>

          <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-md border border-border px-3 py-2 focus:border-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />

          <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-md border border-border px-3 py-2 focus:border-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />

          {error && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-teal px-4 py-2 font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
