import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const sessionCookie = getSessionCookie(request);

	if (pathname === "/" && !sessionCookie) {
		return NextResponse.redirect(new URL("/entrar", request.url));
	}

	if (pathname === "/entrar" && sessionCookie) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	if (pathname === "/esqueci-senha" && sessionCookie) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	if (pathname === "/import/help" && !sessionCookie) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/", "/entrar", "/esqueci-senha", "/import/help"],
};
