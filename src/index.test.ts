/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ConfigError, configureSync, getConfig, type LogRecord, resetSync } from "@logtape/logtape";
import { describe, expect, it, vi } from "vitest";
import { log, report, time } from "./index.js";


describe("report()", () => {

	describe("numbers", () => {

		it("should format numbers with US locale conventions", async () => {
			expect(report(1234567.5)).toBe("1,234,567.5");
		});

		it("should report numbers in full whatever the length limit", async () => {
			expect(report(1234567, 3)).toBe("1,234,567");
		});

	});

	describe("strings", () => {

		// Test content is built from code points rather than written as literals: spelling invisible characters out
		// would embed in this source the very kind of content the tested pattern exists to expose, and would leave the
		// cases indistinguishable from one another on review.

		it("should delimit content with quotation marks", async () => {
			expect(report(" padded ")).toBe("\" padded \"");
		});

		it("should escape the quotation mark and the reverse solidus", async () => {
			expect(report("say \"hi\"")).toBe("\"say \\\"hi\\\"\"");
			expect(report("back\\slash")).toBe("\"back\\\\slash\"");
		});

		it("should clip overlong content", async () => {
			expect(report("a very long value", 8)).toBe(`"a very ${String.fromCodePoint(0x2026)}"`);
		});

		it("should count the length limit in code points", async () => {
			expect(report(String.fromCodePoint(0x1F600).repeat(4), 3))
				.toBe(`"${String.fromCodePoint(0x1F600, 0x1F600, 0x2026)}"`);
		});

		it("should count the length limit ahead of escaping", async () => {
			expect(report("\n\n\n\n", 3)).toBe(`"\\n\\n${String.fromCodePoint(0x2026)}"`);
		});

		it.each([
			["by default", undefined],
			["for a zero limit", 0],
			["for a negative limit", -1]
		])("should leave content unclipped %s", async (_, length) => {
			expect(report("a very long value", length)).toBe("\"a very long value\"");
		});

		describe("invisible characters", () => {

			/**
			 * Reports the code points, surrounded by visible sentinels marking the extent of the reported content.
			 */
			function escaped(...codes: number[]): string {
				return report(`a${String.fromCodePoint(...codes)}b`);
			}

			it("should escape control characters", async () => {
				expect(escaped(0x0000)).toBe("\"a\\u0000b\"");
				expect(escaped(0x007F)).toBe("\"a\\u007Fb\"");
			});

			it("should report the control characters JSON gives a short escape to in that form", async () => {
				expect(escaped(0x0008)).toBe("\"a\\bb\"");
				expect(escaped(0x0009)).toBe("\"a\\tb\"");
				expect(escaped(0x000A)).toBe("\"a\\nb\"");
				expect(escaped(0x000C)).toBe("\"a\\fb\"");
				expect(escaped(0x000D)).toBe("\"a\\rb\"");
			});

			it("should escape line and paragraph separators", async () => {
				expect(escaped(0x2028)).toBe("\"a\\u2028b\"");
				expect(escaped(0x2029)).toBe("\"a\\u2029b\"");
			});

			it("should escape space separators other than the plain space", async () => {
				expect(escaped(0x00A0)).toBe("\"a\\u00A0b\"");
				expect(escaped(0x3000)).toBe("\"a\\u3000b\"");
			});

			it("should escape format characters", async () => {
				expect(escaped(0x00AD)).toBe("\"a\\u00ADb\"");
				expect(escaped(0x202E)).toBe("\"a\\u202Eb\"");
				expect(escaped(0xE0041)).toBe("\"a\\U000E0041b\"");
			});

			it("should escape default ignorable letters", async () => {
				expect(escaped(0x115F)).toBe("\"a\\u115Fb\"");
				expect(escaped(0x1160)).toBe("\"a\\u1160b\"");
				expect(escaped(0x3164)).toBe("\"a\\u3164b\"");
				expect(escaped(0xFFA0)).toBe("\"a\\uFFA0b\"");
			});

			it("should escape default ignorable marks", async () => {
				expect(escaped(0x034F)).toBe("\"a\\u034Fb\"");
			});

			it("should escape unassigned code points", async () => {
				expect(escaped(0x0378)).toBe("\"a\\u0378b\"");
				expect(escaped(0xFDD0)).toBe("\"a\\uFDD0b\"");
				expect(escaped(0xFFFE)).toBe("\"a\\uFFFEb\"");
			});

			it("should escape private use code points", async () => {
				expect(escaped(0xE000)).toBe("\"a\\uE000b\"");
				expect(escaped(0xF8FF)).toBe("\"a\\uF8FFb\"");
				expect(escaped(0x100000)).toBe("\"a\\U00100000b\"");
			});

			it("should escape the blank braille pattern", async () => {
				expect(escaped(0x2800)).toBe("\"a\\u2800b\"");
			});

			it("should escape isolated surrogates", async () => {
				expect(escaped(0xD800)).toBe("\"a\\uD800b\"");
				expect(escaped(0xDFFF)).toBe("\"a\\uDFFFb\"");
			});

		});

		describe("visible characters", () => {

			/**
			 * Asserts that the code points are reported as they are, with no escaping beyond the surrounding quotes.
			 */
			function preserved(...codes: number[]): void {

				const value = String.fromCodePoint(...codes);

				expect(report(value)).toBe(`"${value}"`);

			}

			it("should report the plain space as it is", async () => {
				preserved(0x0061, 0x0020, 0x0062); // a b
			});

			it("should report the zero width joiner as it is", async () => {
				preserved(0x1F468, 0x200D, 0x1F469); // man + ZWJ + woman
			});

			it("should report variation selectors as they are", async () => {
				preserved(0x2764, 0xFE0F); // heart, emoji presentation
				preserved(0x2764, 0xFE0E); // heart, text presentation
				preserved(0x845B, 0xE0100); // ideograph, first ideographic variant
			});

			it("should report combining marks as they are", async () => {
				preserved(0x006E, 0x006F, 0x0065, 0x0301, 0x006C); // noel, decomposed
				preserved(0x0928, 0x092E, 0x0938, 0x094D, 0x0924, 0x0947); // namaste, devanagari
			});

			it("should report well-formed surrogate pairs as they are", async () => {
				preserved(0x0061, 0x1F600, 0x0062); // a + emoji + b
			});

		});

	});

	describe("errors", () => {

		it("should report errors through their message", async () => {
			expect(report(new Error("boom"))).toBe("boom");
			expect(report(new TypeError("boom"))).toBe("boom");
		});

		it("should report error messages as they are", async () => {
			expect(report(new Error(" a very long value "), 8)).toBe(" a very long value ");
		});

	});

	describe("functions", () => {

		it("should report functions through their name", async () => {

			const arrow = (): void => {};

			expect(report(function declared() {})).toBe("declared()");
			expect(report(arrow)).toBe("arrow()");
			expect(report(class Declared {})).toBe("Declared()");

		});

		it("should report anonymous functions through a placeholder name", async () => {
			expect(report(() => {})).toBe("function()");
			expect(report(function () {})).toBe("function()");
		});

		it("should report function names as they are", async () => {
			expect(report(function aVeryLongName() {}, 8)).toBe("aVeryLongName()");
		});

	});

	describe("plain objects and arrays", () => {

		it("should report plain objects and arrays as JSON", async () => {
			expect(report({ status: 503, detail: "Service Unavailable" }))
				.toBe("{\"status\":503,\"detail\":\"Service Unavailable\"}");
			expect(report(Object.assign(Object.create(null), { key: "value" }))).toBe("{\"key\":\"value\"}");
			expect(report([1, "a", { b: true }])).toBe("[1,\"a\",{\"b\":true}]");
		});

		it("should report error-like plain objects as JSON", async () => {
			expect(report({ message: "boom" })).toBe("{\"message\":\"boom\"}");
		});

		it("should clip overlong JSON", async () => {
			expect(report({ key: "a very long value" }, 8)).toBe(`{"key":${String.fromCodePoint(0x2026)}`);
		});

		it("should leave JSON unclipped for a negative limit", async () => {
			expect(report({ key: "a very long value" }, -1)).toBe("{\"key\":\"a very long value\"}");
		});

	});

	describe("other values", () => {

		it("should report other values through their string representation", async () => {
			expect(report(undefined)).toBe("undefined");
			expect(report(null)).toBe("null");
			expect(report(true)).toBe("true");
			expect(report(new URL("https://example.org/path"))).toBe("https://example.org/path");
		});

		it("should report other values in full whatever the length limit", async () => {
			expect(report(new URL("https://example.org/path"), 8)).toBe("https://example.org/path");
		});

	});

	describe("unreadable values", () => {

		it("should report plain objects that can't be serialised through a placeholder", async () => {

			const cyclic: { self?: unknown } = {};

			cyclic.self = cyclic;

			expect(report(cyclic)).toBe("[unreadable value]");
			expect(report({ big: 1n })).toBe("[unreadable value]");
			expect(report(Object.assign(Object.create(null), { big: 1n }))).toBe("[unreadable value]");

		});

		it("should report values that can't be inspected through a placeholder", async () => {

			const revoked = Proxy.revocable({}, {});

			revoked.revoke();

			const trapped = new Proxy({}, {
				getPrototypeOf() { throw new Error("trapped"); }
			});

			class Unconvertible {

				toString(): string {
					throw new Error("unconvertible");
				}

			}

			expect(report(revoked.proxy)).toBe("[unreadable value]");
			expect(report(trapped)).toBe("[unreadable value]");
			expect(report(new Unconvertible())).toBe("[unreadable value]");

		});

		it("should never clip the placeholder", async () => {
			expect(report({ big: 1n }, 8)).toBe("[unreadable value]");
		});

	});

});

describe("log()", () => {

	describe("log()", () => {

		it("should retrieve the root logger", async () => {
			expect(log().category).toEqual([]);
		});

	});

	describe("log(url)", () => {

		it("should retrieve the logger for the category of the url", async () => {
			expect(log("file:///work/node_modules/@scope/pkg/dist/utils.js").category).toEqual(["@scope", "pkg", "utils"]);
		});

	});

	describe("log(category)", () => {

		it("should retrieve the logger for the category", async () => {
			expect(log(["lodash", "map"]).category).toEqual(["lodash", "map"]);
		});

	});

	describe("log(function)", () => {

		/**
		 * Runs the task with internal log entries captured, and returns the records logged while it ran.
		 */
		async function logged(task: () => unknown): Promise<readonly LogRecord[]> {

			const records: LogRecord[] = [];

			configureSync({
				reset: true,
				sinks: { capture: record => records.push(record) },
				loggers: [
					{ category: ["logtape", "meta"], lowestLevel: "warning", sinks: [] },
					{ category: ["/"], lowestLevel: "trace", sinks: ["capture"] }
				]
			});

			try {

				await task();

				return records;

			} finally {

				resetSync();

			}

		}

		it("should pass arguments through and return the result", async () => {

			const fn = log((num: number, str: string, obj: { key: string }, arr: number[]) => ({ num, str, obj, arr }));

			expect(fn(123, "test", { key: "value" }, [1, 2, 3]))
				.toEqual({ num: 123, str: "test", obj: { key: "value" }, arr: [1, 2, 3] });

		});

		it("should handle functions with no arguments", async () => {
			expect(log(() => "success")()).toBe("success");
		});

		it("should handle functions with rest parameters", async () => {

			const sum = log((...numbers: number[]) => numbers.reduce((acc, n) => acc+n, 0));

			expect(sum(1, 2, 3, 4, 5)).toBe(15);
			expect(sum()).toBe(0);

		});

		it("should return synchronous results without wrapping them in a promise", async () => {
			expect(log((x: number) => x*2)(5)).toBe(10);
		});

		it("should return undefined when synchronous functions throw", async () => {
			expect(log((): number => { throw new Error("failed"); })()).toBeUndefined();
		});

		it("should return a promise resolving to the result of async functions", async () => {

			const result = log(async (x: number) => x*2)(5);

			expect(result).toBeInstanceOf(Promise);
			expect(await result).toBe(10);

		});

		it("should resolve to the result of synchronous functions returning promises", async () => {
			expect(await log((x: number) => Promise.resolve(x+1))(10)).toBe(11);
		});

		it("should resolve to undefined when async functions throw", async () => {
			expect(await log(async (): Promise<number> => { throw new Error("failed"); })()).toBeUndefined();
		});

		it("should log thrown errors under the function name", async () => {

			function failing(): never {
				throw new Error("thrown error");
			}

			const records = await logged(() => log(failing)());

			expect(records.map(({ level, category, message }) => ({ level, name: category.at(-1), message })))
				.toEqual([{ level: "error", name: "failing", message: ["thrown error"] }]);

		});

		it("should log rejections under the function name", async () => {

			async function rejecting(): Promise<never> {
				throw new Error("rejected error");
			}

			const records = await logged(() => log(rejecting)());

			expect(records.map(({ level, category, message }) => ({ level, name: category.at(-1), message })))
				.toEqual([{ level: "error", name: "rejecting", message: ["rejected error"] }]);

		});

		it("should log non-error failures through their string representation", async () => {

			function failing(): never {
				throw 42;
			}

			const records = await logged(() => log(failing)());

			expect(records.map(({ message }) => message)).toEqual([["42"]]);

		});

	});

	describe("log(config)", () => {

		// Cases run in sequence over the configuration state the previous ones leave behind.

		it("should auto-configure on first internal logger retrieval", async () => {

			resetSync();
			log(["/", "trigger"]);

			expect(getConfig()).not.toBeNull();

		});

		it("should accept first explicit config from clean state", async () => {

			resetSync();

			expect(() => log({ "/cold": "info" })).not.toThrow();

		});

		it("should allow explicit config to override auto-config", async () => {

			resetSync();
			log("/trigger-auto");

			expect(() => log({ "/override": "debug" })).not.toThrow();

		});

		it("should silently accept repeated identical simplified config", async () => {
			expect(() => log({ "/override": "debug" })).not.toThrow();
		});

		it("should reject repeated different simplified config", async () => {
			expect(() => log({ "/other": "trace" })).toThrow(ConfigError);
		});

		it("should allow explicit config with reset flag", async () => {
			expect(() => log({ reset: true, sinks: {}, loggers: [] })).not.toThrow();
		});

		it("should silently accept repeated identical full config", async () => {
			expect(() => log({ sinks: {}, loggers: [] })).not.toThrow();
		});

		it("should reject repeated different full config", async () => {
			expect(() => log({ sinks: {}, loggers: [{ category: ["test"], sinks: [] }] })).toThrow(ConfigError);
		});

		it("should not auto-configure after reset when custom config was set", async () => {

			resetSync();
			log("/test-module");

			expect(getConfig()).toBeNull();

		});

	});

});

describe("time()", () => {

	describe("asynchronous tasks", () => {

		it("should return a promise resolving to the task result", async () => {
			expect(await time(async () => 42, () => {})).toBe(42);
		});

		it("should invoke the monitor with the result and the elapsed time", async () => {

			const monitor = vi.fn();

			await time(async () => 42, monitor);

			expect(monitor).toHaveBeenCalledExactlyOnceWith(42, expect.any(Number));
			expect(monitor.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(0);

		});

		it("should measure the elapsed time until resolution", async () => {

			const monitor = vi.fn();

			await time(() => new Promise(resolve => setTimeout(resolve, 10, "done")), monitor);

			expect(monitor.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(10);

		});

		it("should reject with the task error without invoking the monitor", async () => {

			const error = new Error("task error");
			const monitor = vi.fn();

			await expect(time(async () => { throw error; }, monitor)).rejects.toBe(error);

			expect(monitor).not.toHaveBeenCalled();

		});

	});

	describe("synchronous tasks", () => {

		it("should return the task result", async () => {
			expect(time(() => 42, () => {})).toBe(42);
		});

		it("should invoke the monitor with the result and the elapsed time", async () => {

			const monitor = vi.fn();

			time(() => 42, monitor);

			expect(monitor).toHaveBeenCalledExactlyOnceWith(42, expect.any(Number));
			expect(monitor.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(0);

		});

		it("should throw the task error without invoking the monitor", async () => {

			const error = new Error("task error");
			const monitor = vi.fn();

			expect(() => time(() => { throw error; }, monitor)).toThrow(error);

			expect(monitor).not.toHaveBeenCalled();

		});

	});

});
