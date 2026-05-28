import { registerOTel } from "@vercel/otel";
import type { Instrumentation } from "next";

export function register() {
	registerOTel({ serviceName: "finance-app" });
}

export const onRequestError: Instrumentation.onRequestError = async (
	error,
	request,
	context,
) => {
	const message = error instanceof Error ? error.message : String(error);
	const digest =
		typeof error === "object" && error !== null && "digest" in error
			? error.digest
			: undefined;

	console.error(
		JSON.stringify({
			level: "error",
			event: "next_request_error",
			message,
			digest,
			path: request.path,
			method: request.method,
			routePath: context.routePath,
			routeType: context.routeType,
			renderSource: context.renderSource,
		}),
	);
};
