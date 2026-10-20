import { NextResponse, type NextRequest } from "next/server";

const sections = [
  { subdomain: "app.", prefix: "/dashboard", home: "/bots" },
  { subdomain: "admin.", prefix: "/admin", home: "/overview" },
];

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const section = sections.find((item) => host.startsWith(item.subdomain));
  if (!section) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
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
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
