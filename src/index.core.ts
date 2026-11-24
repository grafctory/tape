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

/**
 * Value reporting.
 *
 * Formats arbitrary values as readable log content, so that values reported explicitly and values interpolated into
 * console entries by the default configuration read the same way, whatever the type of the value or its content.
 *
 * @internal
 * @module
 */

import { isArray, isError, isFunction, isNumber, isObject, isString } from "@metreeca/core";
import { clip, escape } from "@metreeca/core/strings";


/**
 * Matches the characters a quoted report may not carry as they are.
 *
 * Covers the quotation mark and the reverse solidus, which delimit and escape the report itself, and every character
 * that would otherwise reach the log without a visible glyph of its own:
 *
 * - control characters (`Cc`), line and paragraph separators (`Zl`, `Zp`) and space separators (`Zs`) other than the
 *   plain space, which would break the report across lines or pad it invisibly;
 * - format characters (`Cf`), which carry no glyph and may reorder the surrounding text;
 * - default ignorable code points, which render as nothing whatever their general category, catching the invisible
 *   letters (`U+115F`, `U+1160`, `U+3164`, `U+FFA0`) and marks (`U+034F`) the categories above miss;
 * - unassigned (`Cn`) and private use (`Co`) code points, whose rendering depends on the font rather than on Unicode;
 * - the blank braille pattern (`U+2800`), a symbol by general category that renders as whitespace;
 * - isolated surrogates, which denote no character at all: unicode matching folds a well-formed pair into the single
 *   supplementary code point it denotes, so only an unpaired half is matched.
 *
 * The zero width joiner and the variation selectors (`U+FE00`-`U+FE0F`, `U+E0100`-`U+E01EF`) are reported as they are:
 * none of them renders on its own, but each alters a visible neighbouring glyph, so escaping them would break composed
 * emoji and ideographic variants without revealing anything the rendered text doesn't already show.
 *
 * Combining marks are reported as they are as well, bar the default ignorable ones: they render as part of the
 * grapheme they attach to, and escaping them would make text in the scripts that require them illegible; a leading
 * mark attaches to the opening quotation mark of the report.
 *
 * Membership in the unassigned category tracks the Unicode version of the runtime, so a code point assigned after that
 * version is reported as an escape.
 */
const QuotePattern = new RegExp([
	"[\"\\\\\\p{Cc}\\p{Zl}\\p{Zp}\\p{Cn}\\p{Co}\\u2800\\uD800-\\uDFFF]",
	"[^\\P{Cf}\\u200D]",
	"[^\\P{Zs} ]",
	"[^\\P{Default_Ignorable_Code_Point}\\p{Variation_Selector}\\u200D]"
].join("|"), "gu");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Formats a value as a readable report.
 *
 * Reports numbers with grouped digits, strings as quoted literals with their invisible characters surfaced as escapes,
 * errors through their message, functions through their name, plain objects and arrays as compact JSON, and every
 * other value, class instances included, through the string representation it defines for itself.
 *
 * The console sink of the default configuration formats every value a log message interpolates the same way, whether
 * bound to a placeholder or embedded in a tagged template, so structured properties need no explicit formatting.
 *
 * **Numbers**
 *
 * Numbers are formatted with the digit grouping of the `en-US` locale, whatever the ambient locale, so that reports of
 * the same value are comparable across systems.
 *
 * **Strings**
 *
 * String content is delimited by quotation marks, so leading and trailing whitespace is bounded and its extent is
 * unambiguous, and is escaped so that nothing it carries can hide from the log or corrupt it: the quotation mark and
 * the reverse solidus, which would otherwise close or escape the literal, and every character with no visible glyph
 * of its own, that is control characters, line and paragraph separators, space separators other than the plain space,
 * format characters, default ignorable code points whatever their general category, unassigned and private use code
 * points, the blank braille pattern and isolated surrogates. Escapes take the two-character JSON form where one is
 * defined (`\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`) and the `\uXXXX` / `\UXXXXXXXX` numeric form otherwise.
 *
 * The zero width joiner, the variation selectors and the combining marks are reported as they are: none of them
 * renders on its own, but each alters a visible neighbouring glyph, so escaping them would break composed emoji,
 * ideographic variants and the scripts that require marks, without revealing anything the rendered text doesn't
 * already show. A leading mark attaches to the opening quotation mark of the report.
 *
 * **Errors**
 *
 * Errors are reported through their message, without the class name their string representation would prefix it with:
 * the level and the context of the log entry already state that a failure is being reported. Messages are composed by
 * the throwing code rather than carried in from the outside, so they are reported as they are, neither delimited,
 * escaped nor clipped: report the offending values separately where their extent or their invisible content matters.
 *
 * **Functions**
 *
 * Functions are reported through their name followed by an empty argument list, classes and other callable values
 * included, rather than through the source text their string representation would expose: the name identifies the
 * function in the code, while its body would bury the log entry under content that belongs to the source. Names are
 * code-defined, so they are reported as they are, neither escaped nor clipped. Anonymous functions, whose name is
 * empty because no declaration, binding or property definition supplied one, take the `function` keyword in place of a
 * name and are reported as `function()`.
 *
 * **Plain Objects and Arrays**
 *
 * Plain objects, null-prototype objects included, and arrays are reported as compact JSON. Failures are often thrown
 * as structured values, such as RFC 9457 problem details, and JSON shows what they carry rather than `[object Object]`.
 * Error-like plain objects are therefore reported as JSON too, rather than through their message.
 *
 * JSON leaves out the members it can't represent, such as functions and `undefined` values. String values carry only
 * the escapes JSON defines, so invisible format characters reach the log as they are: report such strings separately.
 *
 * **Other Values**
 *
 * Every other value is reported through its string representation, class instances included. Instances such as dates
 * and URLs define a readable representation of their own, while their properties would expose internals instead.
 *
 * **Unreadable Values**
 *
 * A value that can't be inspected or converted without throwing, such as a revoked proxy, an object whose string
 * conversion fails, or a plain object JSON can't serialise because it is cyclic or holds a `bigint`, is reported as
 * `[unreadable value]`, so that reporting a value never throws in the logging code. The placeholder is never clipped.
 *
 * @param value The value to report
 * @param length The maximum length in code points of the reported string content, counted before escaping, or of the
 *     reported JSON, counted after serialisation; longer content is clipped, with the last retained code point replaced
 *     by an ellipsis; `0` or a negative value disables clipping; ignored for values other than strings, plain objects
 *     and arrays, and for the `[unreadable value]` placeholder; defaults to `0`
 *
 * @returns The formatted number, quoted and escaped string literal, error message, function name with an empty
 *     argument list, JSON serialisation, or string representation of `value`, or the `[unreadable value]` placeholder
 *     if `value` can't be inspected or converted to a string without throwing an error
 */
export function report(value: unknown, length?: number): string {

	try {

		return isNumber(value) ? value.toLocaleString("en-US")
			: isString(value) ? `"${escape(clip(value, length), QuotePattern)}"`
				: isError(value) ? value.message
					: isFunction(value) ? `${value.name || "function"}()`
						: isPlain(value) ? clip(JSON.stringify(value), length)
							: String(value);

	} catch { // revoked proxies, throwing proxy traps, string conversions or JSON serialisations

		return "[unreadable value]";

	}


	function isPlain(value: unknown): value is object {

		return isArray(value)
			|| isObject(value)
			|| value !== null && typeof value === "object" && Object.getPrototypeOf(value) === null;

	}

}
