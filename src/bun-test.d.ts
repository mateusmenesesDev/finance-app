declare module "bun:test" {
	export function describe(name: string, fn: () => void): void;
	export function test(name: string, fn: () => void): void;
	export const expect: (actual: unknown) => {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
	};
}
