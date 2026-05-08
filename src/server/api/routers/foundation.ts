import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const foundationRouter = createTRPCRouter({
	status: publicProcedure.query(() => ({
		app: "Finance App",
		currency: "BRL",
		locale: "pt-BR",
	})),
});
