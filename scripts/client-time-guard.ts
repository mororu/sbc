// Build check (AD-9): no client chunk may contain src/lib/time (it uses Temporal, which iOS Safari
// lacks) or the zone name it formats with. Client code gets every date and time pre-formatted in
// the view model. We do not search for the word "Temporal": SvelteKit's devalue names
// `Temporal.Instant` etc. in its own client code.
import { resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/** The marker string: only src/lib/time names the zone. */
export const ZONE_MARKER = 'Europe/Zurich';

type ChunkLike = { type: 'chunk'; fileName: string; code: string; moduleIds: readonly string[] };
type AssetLike = { type: 'asset'; fileName: string };

/** The problems in a client bundle, one line per offending chunk. Empty when the bundle is clean. */
export function findClientTimeLeaks(
	bundle: Record<string, ChunkLike | AssetLike>,
	timeDir: string
): string[] {
	const prefix = timeDir.endsWith(sep) ? timeDir : timeDir + sep;
	const problems: string[] = [];
	for (const output of Object.values(bundle)) {
		if (output.type !== 'chunk') continue;
		const modules = output.moduleIds.filter((id) => id.split('?')[0].startsWith(prefix));
		if (modules.length > 0) {
			problems.push(`${output.fileName} includes ${modules.join(', ')}`);
		} else if (output.code.includes(ZONE_MARKER)) {
			problems.push(`${output.fileName} contains "${ZONE_MARKER}"`);
		}
	}
	return problems;
}

/** Fails the client build if any client chunk contains src/lib/time. */
export function clientTimeGuard(timeDir = resolve('src/lib/time')): Plugin {
	return {
		name: 'client-time-guard',
		apply: 'build',
		applyToEnvironment: (environment) => environment.config.consumer === 'client',
		generateBundle(_options, bundle) {
			const problems = findClientTimeLeaks(bundle as Record<string, ChunkLike | AssetLike>, timeDir);
			if (problems.length > 0) {
				this.error(
					'src/lib/time must not reach the browser: pass pre-formatted strings in the view model instead.\n' +
						problems.map((p) => `  - ${p}`).join('\n')
				);
			}
		}
	};
}
