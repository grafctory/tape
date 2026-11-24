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

import { describe, expectTypeOf, it } from "vitest";
import { log, time } from "./index.js";


describe("log()", () => {

	describe("log(function)", () => {

		it("should preserve the arguments and widen the result of synchronous functions with undefined", async () => {
			expectTypeOf(log((x: number, y: string) => `${x}${y}`))
				.toEqualTypeOf<(x: number, y: string) => undefined | string>();
		});

		it("should preserve the arguments and widen the result of async functions with undefined", async () => {
			expectTypeOf(log(async (x: number) => String(x)))
				.toEqualTypeOf<(x: number) => Promise<undefined | string>>();
		});

	});

});

describe("time()", () => {

	it("should return a promise of the result for asynchronous tasks", async () => {
		expectTypeOf(time(async () => 42, () => {})).toEqualTypeOf<Promise<number>>();
	});

	it("should return the result for synchronous tasks", async () => {
		expectTypeOf(time(() => 42, () => {})).toEqualTypeOf<number>();
	});

});
