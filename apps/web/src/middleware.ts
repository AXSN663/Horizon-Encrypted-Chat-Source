import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Handle /chat/@id routes (can be username or room ID)
  if (pathname.startsWith('/chat/@')) {
    const id = pathname.replace('/chat/@', '');
    if (id) {
      // Redirect to /chat/_user/id internally - the page will handle whether it's a user or room
      const url = request.nextUrl.clone();
      url.pathname = `/chat/_user/${id}`;
      return NextResponse.rewrite(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/@:path*'],
};
