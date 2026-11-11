// The inline theme script in app.html (UX-DR10, UX-DR76): it runs before first paint, so it is
// tested here by running its exact source against stand-in document and localStorage objects.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('src/app.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

function run(storage: { getItem: (key: string) => string | null }) {
	const documentElement = { dataset: {} as Record<string, string> };
	new Function('localStorage', 'document', scripts[0])(storage, { documentElement });
	return documentElement.dataset.theme;
}

const stored = (value: string | null) => ({ getItem: (key: string) => (key === 'theme' ? value : null) });

describe('inline theme script', () => {
	it('is the only inline script', () => {
		expect(scripts).toHaveLength(1);
	});

	it.each(['light', 'dark'])('applies a stored %s choice', (value) => {
		expect(run(stored(value))).toBe(value);
	});

	it.each([null, 'blue', ''])('leaves the device setting in charge for %s', (value) => {
		expect(run(stored(value))).toBeUndefined();
	});

	it('survives blocked storage', () => {
		const blocked = {
			getItem: () => {
				throw new Error('SecurityError');
			}
		};
		expect(run(blocked)).toBeUndefined();
	});

	it('reads the same key the theme switch writes', () => {
		const component = readFileSync('src/lib/components/ThemeSwitch.svelte', 'utf8');
		expect(scripts[0]).toContain("localStorage.getItem('theme')");
		expect(component).toContain("localStorage.setItem('theme', theme)");
	});

	it('keeps a known CSP hash (update the production CSP when this changes)', () => {
		const hash = createHash('sha256').update(scripts[0]).digest('base64');
		expect(`sha256-${hash}`).toMatchInlineSnapshot(`"sha256-T2Mcg8DZ+ZtlP8Be/TnKVZmPykig5ki7TKMTpCnEoHM="`);
	});
});
