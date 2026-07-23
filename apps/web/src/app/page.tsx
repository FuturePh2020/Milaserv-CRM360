import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="rounded-card border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-navy">Milaserv CRM360</h1>
        <p className="mt-2 text-muted-slate">Telesales Leads Distributor</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-teal px-4 py-2 font-medium text-white hover:bg-deep-teal"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
