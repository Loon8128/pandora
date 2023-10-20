import { GetLogger } from 'pandora-common';
import type { IEmailSender } from '.';
import { GenerateEmailHash } from '../../account/accountSecure';

const logger = GetLogger('MockEmailSender');

export class MockEmailSender implements IEmailSender {

	public init(): void {
		logger.info('Email transporter is ready');
	}

	public async sendPasswordReset(email: string, username: string, token: string): Promise<void> {
		logger.info(`SendPasswordReset:\n\temail: '${GenerateEmailHash(email)}'\n\t username: '${username}'\n\t token: '${token}'`);
		return Promise.resolve();
	}

	public async sendRegistrationConfirmation(email: string, username: string, token: string): Promise<void> {
		logger.info(`SendRegistrationConfirmation:\n\temail: '${GenerateEmailHash(email)}'\n\t username: '${username}'\n\t token: '${token}'`);
		return Promise.resolve();
	}

}
