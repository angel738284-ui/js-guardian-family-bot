import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col items-center px-4 py-32 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-subtle">404</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-fg">Page not found</h1>
      <p className="mt-3 text-muted">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-fg">
        Back home
      </Link>
    </div>
  );
}
