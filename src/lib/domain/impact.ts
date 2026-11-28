// Impact (FR-12, FR-13, FR-18; AD-6, AD-21; Story 3.3): what a change does to the one booking behind
// it, as the impact dialog shows it and as the command rechecks it on confirm. Deleting a booking
// uses it now; creating or deleting a block (3.5) and a pre-heat change (3.7) reuse it.
// Pure: every input is a parameter. The caller finds the affected booking (`affectedBooking`) and
// passes the live bookings and blocks as they will be *after* the change.
import { classifyHeatChange, type HeatChangeClass } from './heat-change.ts';
import type { Block, Booking } from './heat.ts';
import { endsHeatChangeMail } from './keybox.ts';
import { bookingNotice, serializeNotice, type Notice, type Preheat } from './notice.ts';
import type { OutboxState } from './outbox.ts';

/**
 * - `none`: no affected booking, nothing told yet, or nothing worth telling changed.
 * - `mail`: the heat-change email goes out (the keybox email has not ended heat-change mail).
 * - `call`: the keybox email is in flight, retrying or done; the change goes to the call list.
 */
export type ImpactConsequence = 'none' | 'mail' | 'call';

export type Impact = {
	/** The booking whose notice the change can move, or null. */
	affected: Booking | null;
	/** What its guest was (or is about to be) told, or null when unknown. */
	told: Notice | null;
	/** Its notice after the change, or null without an affected booking. */
	current: Notice | null;
	/** `classifyHeatChange(told, current)`; `none` when either is missing. */
	class: HeatChangeClass;
	consequence: ImpactConsequence;
};

export type ImpactInput = {
	affected: Booking | null;
	/** Live bookings after the change (the deleted booking left out). */
	bookings: Booking[];
	/** Blocks after the change. */
	blocks: Block[];
	preheat: Preheat;
	/** The affected booking's told notice (`toldNotice`). */
	told: Notice | null;
	/** The affected booking's keybox row state, or null when it has none. */
	keyboxState: OutboxState | null;
};

export function impactOn(input: ImpactInput): Impact {
	const { affected, told } = input;
	if (!affected) return { affected: null, told: null, current: null, class: 'none', consequence: 'none' };
	const current = bookingNotice(affected, input.bookings, input.blocks, input.preheat);
	const heatClass = told ? classifyHeatChange(told, current) : 'none';
	let consequence: ImpactConsequence = 'none';
	if (told && heatClass !== 'none') {
		consequence = input.keyboxState !== null && endsHeatChangeMail(input.keyboxState) ? 'call' : 'mail';
	}
	return { affected, told, current, class: heatClass, consequence };
}

/**
 * A deterministic string over the impact: the affected booking's id and start, the told and current
 * notices (canonical JSON), the class and the consequence. The form posts it; the command recomputes
 * it and refuses with `stale` when it differs. Deliberately not covered: the guest's name and the
 * wording that depends on `now` (e.g. an arrival already past); neither changes what the command does.
 */
export function impactToken(impact: Impact): string {
	const notice = (n: Notice | null) => (n ? serializeNotice(n) : null);
	return JSON.stringify([
		impact.affected?.id ?? null,
		impact.affected?.start ?? null,
		notice(impact.told),
		notice(impact.current),
		impact.class,
		impact.consequence
	]);
}
