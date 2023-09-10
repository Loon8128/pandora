import { ConsoleMessage, Page } from '@playwright/test';

const handleLog = (message: ConsoleMessage) => {
	if (message.type() === 'error') {
		// Ignore socket.io errors (some tests test non-working server connection)
		if (/\/socket\.io\//.test(message.location().url))
			return;

		// eslint-disable-next-line no-console
		console.error(
			'Page emitted error log:\n',
			message.text(),
			'\n',
			message.location(),
		);
		throw new Error('Page emitted error log');
	}
};

// eslint-disable-next-line @typescript-eslint/require-await
export async function TestSetupPage(page: Page): Promise<void> {
	page.on('console', handleLog);
}

interface TestOpenPandoraOptions {
	/** @default '/' */
	path?: `/${string}`;
	/** @default true */
	agreeEula?: boolean;
}

export async function TestOpenPandora(page: Page, options: TestOpenPandoraOptions = {}): Promise<void> {
	await TestSetupPage(page);

	await page.goto(options.path ?? '/');

	if (options.agreeEula !== false) {
		await page.getByRole('button', { name: /^Agree/ }).click();
		await page.waitForURL('/login');
	}
}