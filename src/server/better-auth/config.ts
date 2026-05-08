import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { env } from "~/env";
import { db } from "~/server/db";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg", // or "pg" or "mysql"
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
