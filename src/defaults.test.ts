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

import { configureSync, getLogger, type Logger, type LogLevel, resetSync } from "@logtape/logtape";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaults } from "./defaults.js";


describe("defaults()", () => {

	describe("loggers", () => {

		const meta = { category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] };
		const internal = { category: ["/"], lowestLevel: "info", sinks: ["console"] };

		it("should route LogTape meta warnings and internal info entries to the console by default", async () => {
			expect(defaults({}).loggers).toEqual([meta, internal]);
		});

		it("should route configured categories to the console at their levels", async () => {
			expect(defaults({ "lodash/map": "debug", "@scope/pkg": "error" }).loggers).toEqual([
				meta,
				internal,
				{ category: ["lodash", "map"], lowestLevel: "debug", sinks: ["console"] },
				{ category: ["@scope", "pkg"], lowestLevel: "error", sinks: ["console"] }
			]);
		});

		it("should let configured levels replace the default ones", async () => {
			expect(defaults({ "logtape/meta": "error", "/": "trace" }).loggers).toEqual([
				{ ...meta, lowestLevel: "error" },
				{ ...internal, lowestLevel: "trace" }
			]);
		});

	});

	describe("console entries", () => {

		beforeEach(() => {
			configureSync(defaults({ "/": "trace" }));
		});

		afterEach(() => {
			resetSync();
			vi.restoreAllMocks();
		});

		/**
		 * Logs through the default console sink and returns the arguments it passes to the console method.
		 */
		function printed(method: "debug" | "info" | "warn" | "error", emit: (logger: Logger) => void): unknown[] {

			const spy = vi.spyOn(console, method).mockImplementation(() => {});

			emit(getLogger(["/"]));

			return spy.mock.calls[0] ?? [];

		}

		/**
		 * Logs at info level and returns the message text printed, without prefix and source label.
		 */
		function message(emit: (logger: Logger) => void): string {
			return String(printed("info", emit).at(-1));
		}

		it.each<[LogLevel, "debug" | "info" | "warn" | "error", string]>([
			["trace", "debug", "???"],
			["debug", "debug", " ??"],
			["info", "info", "  ?"],
			["warning", "warn", "  !"],
			["error", "error", " !!"],
			["fatal", "error", "!!!"]
		])("should prefix %s entries with their severity", async (level, method, prefix) => {
			expect(printed(method, logger => logger[level]("entry"))[1]).toBe(prefix);
		});

		it("should pad source labels to a fixed width", async () => {
			expect(printed("info", logger => logger.info("entry"))[2]).toBe("/".padEnd(20));
		});

		it.each([
			["plain objects as JSON", { pipe: "/events" }, "{\"pipe\":\"/events\"}"],
			["arrays as JSON", [1, "a"], "[1,\"a\"]"],
			["strings as quoted literals", "tag\n", "\"tag\\n\""],
			["numbers with grouped digits", 1234567, "1,234,567"],
			["errors through their message", new Error("boom"), "boom"],
			["functions through their name", function fetchUsers() {}, "fetchUsers()"],
			["other values through their string representation", new URL("https://example.org/"), "https://example.org/"]
		])("should format placeholder %s", async (_, value, expected) => {
			expect(message(logger => logger.info("value {value}", { value }))).toBe(`value ${expected}`);
		});

		it("should format tagged template values", async () => {
			expect(message(logger => logger.info`labels ${{ pipe: "/events" }} tag ${"tag"}`))
				.toBe("labels {\"pipe\":\"/events\"} tag \"tag\"");
		});

		it("should leave message text as it is", async () => {
			expect(message(logger => logger.info("say \"hi\"\n{count}", { count: 1 }))).toBe("say \"hi\"\n1");
		});

	});

});
