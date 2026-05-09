declare module "bun:test" {
	export function describe(name: string, fn: () => void): void;
	export function test(name: string, fn: () => void): void;
	type Matchers = {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toHaveLength(expected: number): void;
		toContain(expected: unknown): void;
		toMatch(expected: RegExp | string): void;
		toBeGreaterThan(expected: number): void;
		toBeGreaterThanOrEqual(expected: number): void;
		toBeLessThan(expected: number): void;
		toBeLessThanOrEqual(expected: number): void;
		not: Matchers;
	};
	export const expect: (actual: unknown) => Matchers;
}
