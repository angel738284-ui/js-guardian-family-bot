import { NextResponse, type NextRequest } from "next/server";

// app.asena.fun serves /dashboard and admin.asena.fun serves /admin, without the prefix in the URL.
const sections = [
  { subdomain: "app.", prefix: "/dashboard", home: "/bots" },
  { subdomain: "admin.", prefix: "/admin", home: "/overview" },
];

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const section = sections.find((item) => host.startsWith(item.subdomain));
  if (!section) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  // The site's own "/" is prerendered and wins over a rewrite, so the subdomain root redirects to a real page.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = section.home;
    return NextResponse.redirect(url);
  }
  if (pathname === section.prefix || pathname.startsWith(`${section.prefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(section.prefix.length) || section.home;
    return NextResponse.redirect(url);
  }
  const url = request.nextUrl.clone();
  url.pathname = `${section.prefix}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next.js internals and files with an extension (images, icons).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
