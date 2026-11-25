// Stories 3.7, 3.8: the settings page's client decisions, per card and for the pre-heat dialog.
import { describe, expect, it } from 'vitest';
import type { PreheatDialogView } from '#lib/server/settings-view.ts';
import { cardOutcome, cardStep, firstErrorField, preheatSaveStep } from './settings-outcome.ts';

const dialog = { title: 'Vorheizzeit ändern?', token: 'T' } as PreheatDialogView;

describe('cardStep', () => {
	it('follows a redirect (an ended session)', () => {
		expect(cardStep({ type: 'redirect' }, 'hours')).toEqual({ kind: 'redirect' });
	});

	it('shows saved, errors or the pre-heat dialog for its own card', () => {
		expect(cardStep({ type: 'success', data: { card: 'hours', saved: true } }, 'hours')).toEqual({ kind: 'saved' });
		expect(
			cardStep({ type: 'failure', data: { card: 'changeover', errors: { minutes: 'settings_changeover_range' }, values: { minutes: '7' } } }, 'changeover')
		).toEqual({ kind: 'errors', errors: { minutes: 'settings_changeover_range' } });
		expect(cardStep({ type: 'success', data: { card: 'preheat', values: {}, dialog } }, 'preheat')).toEqual({ kind: 'dialog', dialog });
		expect(cardStep({ type: 'success', data: { card: 'preheat', saved: true } }, 'preheat')).toEqual({ kind: 'saved' });
	});

	it('fails on a lock timeout, an error, a network error or another card’s answer', () => {
		expect(cardStep({ type: 'failure', data: { card: 'hours', code: 'failed' } }, 'hours')).toEqual({ kind: 'failed' });
		expect(cardStep({ type: 'error' }, 'hours')).toEqual({ kind: 'failed' });
		expect(cardStep({ type: 'success', data: { card: 'horizon', saved: true } }, 'hours')).toEqual({ kind: 'failed' });
		expect(cardStep({ type: 'failure', data: { card: 'hours', errors: {} } }, 'hours')).toEqual({ kind: 'failed' });
	});
});

describe('preheatSaveStep', () => {
	it('closes on saved, keeps the dialog with the new impact on stale', () => {
		expect(preheatSaveStep({ type: 'success', data: { card: 'preheat', saved: true } })).toEqual({ kind: 'saved' });
		expect(preheatSaveStep({ type: 'failure', data: { card: 'preheat', code: 'stale', dialog } })).toEqual({ kind: 'stale', dialog });
	});

	it('shows errors in the card, a failure in the dialog, and follows a redirect', () => {
		expect(preheatSaveStep({ type: 'failure', data: { card: 'preheat', errors: { min: 'settings_preheat_range' } } })).toEqual({
			kind: 'errors',
			errors: { min: 'settings_preheat_range' }
		});
		expect(preheatSaveStep({ type: 'failure', data: { card: 'preheat', code: 'failed' } })).toEqual({ kind: 'failed' });
		expect(preheatSaveStep({ type: 'failure', data: { card: 'preheat', code: 'stale' } })).toEqual({ kind: 'failed' });
		expect(preheatSaveStep({ type: 'error' })).toEqual({ kind: 'failed' });
		expect(preheatSaveStep({ type: 'redirect' })).toEqual({ kind: 'redirect' });
	});
});

describe('cardOutcome (native POST)', () => {
	it('belongs to its card only', () => {
		expect(cardOutcome(null, 'hours')).toBeNull();
		expect(cardOutcome({ card: 'horizon', saved: true }, 'hours')).toBeNull();
	});

	it('keeps the values and errors, never a password', () => {
		expect(cardOutcome({ card: 'hours', errors: { close: 'settings_hours_order' }, values: { open: '12:00', close: '11:00' } }, 'hours')).toEqual({
			errors: { close: 'settings_hours_order' },
			values: { open: '12:00', close: '11:00' },
			status: null
		});
		expect(cardOutcome({ card: 'password', errors: { password: 'admin_password_too_short' }, values: { password: 'leak' } }, 'password')).toEqual({
			errors: { password: 'admin_password_too_short' },
			values: {},
			status: null
		});
	});

	it('shows saved or the failure', () => {
		expect(cardOutcome({ card: 'contact', saved: true }, 'contact')).toEqual({ errors: {}, values: {}, status: 'saved' });
		expect(cardOutcome({ card: 'contact', code: 'failed' }, 'contact')).toEqual({ errors: {}, values: {}, status: 'failed' });
		// A check answered without JavaScript: values kept, no status.
		expect(cardOutcome({ card: 'preheat', values: { min: '40', max: '50' }, dialog }, 'preheat')).toEqual({
			errors: {},
			values: { min: '40', max: '50' },
			status: null
		});
	});
});

describe('firstErrorField', () => {
	it('is the first field in form order', () => {
		expect(firstErrorField(['min', 'max'], { max: 'settings_preheat_range', min: 'settings_preheat_swapped' })).toBe('min');
		expect(firstErrorField(['min', 'max'], {})).toBeUndefined();
	});
});

describe('season and keybox (Story 3.8)', () => {
	it('an overlap is a field error on start; not_found / past / lock timeout are the in-card failure', () => {
		expect(
			cardStep(
				{ type: 'failure', data: { card: 'season', errors: { start: 'settings_season_overlap' }, values: { start: '2027-04-01', end: '2027-05-31', id: '' } } },
				'season'
			)
		).toEqual({ kind: 'errors', errors: { start: 'settings_season_overlap' } });
		expect(firstErrorField(['start', 'end'], { start: 'settings_season_overlap' })).toBe('start');
		expect(cardStep({ type: 'failure', data: { card: 'season', code: 'failed' } }, 'season')).toEqual({ kind: 'failed' });
		expect(cardStep({ type: 'failure', data: { card: 'keybox', code: 'failed' } }, 'keybox')).toEqual({ kind: 'failed' });
		expect(cardStep({ type: 'success', data: { card: 'keybox', saved: true } }, 'keybox')).toEqual({ kind: 'saved' });
	});

	it('after a native POST keeps the season values with the error, and shows saved for the keybox card', () => {
		expect(
			cardOutcome({ card: 'season', errors: { end: 'settings_season_order' }, values: { start: '2027-01-09', end: '2027-01-09', id: '1' } }, 'season')
		).toEqual({ errors: { end: 'settings_season_order' }, values: { start: '2027-01-09', end: '2027-01-09', id: '1' }, status: null });
		expect(cardOutcome({ card: 'keybox', saved: true }, 'keybox')).toEqual({ errors: {}, values: {}, status: 'saved' });
		expect(cardOutcome({ card: 'season', code: 'failed' }, 'season')).toEqual({ errors: {}, values: {}, status: 'failed' });
	});
});
