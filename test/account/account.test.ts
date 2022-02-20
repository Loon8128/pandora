import { Account, CreateAccountData } from '../../src/account/account';

describe('CreateAccountData()', () => {
	it('should return an object', async () => {
		expect(typeof await CreateAccountData('test', 'meh', 'test@example.com', true)).toBe('object');
	});
});

describe('Account', () => {
	let dataActive: Awaited<ReturnType<typeof CreateAccountData>>;
	let dataInactive: Awaited<ReturnType<typeof CreateAccountData>>;
	let accountActive: Account;
	let accountInactive: Account;
	beforeAll(async () => {
		dataActive = await CreateAccountData('test', 'meh', 'test@example.com', true);
		dataInactive = await CreateAccountData('test2', 'meh2', 'test2@example.com', false);

	});
	beforeEach(() => {
		accountActive = new Account(dataActive);
		accountInactive = new Account(dataInactive);
	});

	describe('touch()', () => {
		it('should update last activity timestamp', () => {
			accountActive.touch();
			const now = Date.now();
			expect(accountActive.lastActivity).toBe(now);
		});
	});

	describe('isActivated()', () => {
		it('should return account correct active status', () => {
			expect(accountActive.isActivated()).toBe(true);
			expect(accountInactive.isActivated()).toBe(false);
		});
	});

});
