// Contrast floors (NFR-1, UX-DR1/DR2) and token discipline: hex colours live only in tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TOKENS = 'src/lib/styles/tokens.css';
const css = readFileSync(TOKENS, 'utf8');

/** The custom properties declared in the first block whose selector matches. */
function block(selector: RegExp): Record<string, string> {
	const match = selector.exec(css);
	if (!match) throw new Error(`No block for ${selector}`);
	const start = css.indexOf('{', match.index + match[0].length - 1) + 1;
	let depth = 1;
	let end = start;
	while (depth > 0) {
		if (end >= css.length) throw new Error(`Unclosed block for ${selector}`);
		if (css[end] === '{') depth++;
		if (css[end] === '}') depth--;
		end++;
	}
	const body = css.slice(start, end - 1).replace(/\/\*[\s\S]*?\*\//g, '');
	return Object.fromEntries(
		[...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
	);
}

type Rgba = [number, number, number, number];

function hex(value: string): Rgba {
	const h = value.replace('#', '');
	if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) throw new Error(`Not a 6/8-digit hex: ${value}`);
	const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
	return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

/** Composites a possibly translucent colour over an opaque background. */
function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
	return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: Rgba, bg: Rgba): number {
	const [a, b] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x);
	return (a + 0.05) / (b + 0.05);
}

const light = block(/:root\s*\{/);
const dark = block(/:root\[data-theme='dark'\]\s*\{/);
const darkMedia = block(/:root:not\(\[data-theme='light'\]\)\s*\{/);

// The focus ring is held to the text floor too (spec), although WCAG asks 3:1 for it.
const TEXT_ROLES = ['text', 'muted', 'primary', 'hot', 'cold-start', 'taken', 'error', 'focus'];
const NON_TEXT_ROLES = ['line-strong'];
const GROUNDS = ['background', 'surface'];

describe.each([
	['light', light],
	['dark', dark]
])('%s mode', (_mode, tokens) => {
	it.each(TEXT_ROLES.flatMap((role) => GROUNDS.map((ground) => [role, ground])))(
		'%s on %s is at least 4.5:1',
		(role, ground) => {
			expect(contrast(hex(tokens[role]), hex(tokens[ground]))).toBeGreaterThanOrEqual(4.5);
		}
	);

	it.each(NON_TEXT_ROLES.flatMap((role) => GROUNDS.map((ground) => [role, ground])))(
		'%s on %s is at least 3:1',
		(role, ground) => {
			expect(contrast(hex(tokens[role]), hex(tokens[ground]))).toBeGreaterThanOrEqual(3);
		}
	);

	it.each([
		['on-primary', 'primary'],
		['on-error', 'error']
	])('%s on %s is at least 4.5:1', (fg, bg) => {
		expect(contrast(hex(tokens[fg]), hex(tokens[bg]))).toBeGreaterThanOrEqual(4.5);
	});
});

describe('token file', () => {
	it('declares the same colours for the stored dark choice and the device dark setting', () => {
		expect(darkMedia).toEqual(dark);
	});

	it('gives every light colour a dark twin', () => {
		const colourRoles = Object.keys(light).filter((k) => light[k].startsWith('#'));
		expect(Object.keys(dark).sort()).toEqual(colourRoles.sort());
	});
});

describe('token discipline', () => {
	function files(dir: string): string[] {
		return readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			if (path === 'src/lib/paraglide') return [];
			return statSync(path).isDirectory() ? files(path) : [path];
		});
	}

	const sources = () =>
		files('src').filter(
			(f) => /\.(css|svelte|ts|js|html)$/.test(f) && f !== TOKENS && !f.endsWith('.test.ts')
		);

	it('has no hex colour outside tokens.css', () => {
		const offenders = sources().filter((f) =>
			/#[0-9a-f]{3}(?:[0-9a-f]{1,5})?\b(?![-\w])/i.test(readFileSync(f, 'utf8'))
		);
		expect(offenders).toEqual([]);
	});

	it('has no colour functions outside tokens.css', () => {
		const offenders = sources().filter((f) =>
			/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i.test(readFileSync(f, 'utf8'))
		);
		expect(offenders).toEqual([]);
	});
});

describe('README contrast table', () => {
	it('matches the ratios computed from tokens.css', () => {
		const readme = readFileSync('README.md', 'utf8');
		const ratio = (fg: string, bg: string, t: Record<string, string>) =>
			`${contrast(hex(t[fg]), hex(t[bg])).toFixed(2)}:1`;
		for (const role of [...TEXT_ROLES, ...NON_TEXT_ROLES]) {
			const cells = [light, dark].flatMap((t) => GROUNDS.map((g) => ratio(role, g, t)));
			expect(readme).toContain(`| ${cells.join(' | ')} |`);
		}
		for (const [fg, bg] of [
			['on-primary', 'primary'],
			['on-error', 'error']
		]) {
			expect(readme).toContain(`| ${ratio(fg, bg, light)} | – | ${ratio(fg, bg, dark)} | – |`);
		}
	});
});
