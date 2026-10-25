import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session by calling getUser
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes - allow access: the landing page ('/' — it renders for
  // signed-in users too and only swaps its nav links), auth pages, the auth
  // API endpoints, the legal pages, and the crawler-facing metadata routes
  // (.xml/.txt and the extension-free image routes are not covered by the
  // matcher's asset exclusions, and bots never carry a session cookie).
  const PUBLIC_PREFIXES = [
    '/login',
    '/signup',
    '/api/auth',
    '/privacy',
    '/terms',
    '/sitemap.xml',
    '/robots.txt',
    '/opengraph-image',
    '/twitter-image',
    '/icon',
    '/apple-icon',
  ];
  if (pathname === '/' || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // API requests must reach their route handlers, which enforce the session
  // themselves and return 401 JSON. Redirecting here instead would 307 a POST
  // to /login (→ 405 HTML), making every client-side 401 branch — draft
  // saving, re-login nudges (Review Focus 4) — unreachable.
  if (!user && pathname.startsWith('/api')) {
    return supabaseResponse;
  }

  // If user is not authenticated and trying to access protected route, redirect to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
