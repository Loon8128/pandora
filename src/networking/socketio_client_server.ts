import type { Socket } from 'socket.io';
import type { IncomingMessage, Server as HttpServer } from 'http';
import { GetLogger } from 'pandora-common/dist/logging';
import { IsCharacterId } from 'pandora-common/dist/validation';
import { SocketIOServer } from './socketio_common_server';
import { SocketIOConnectionClient } from './socketio_client_connection';
import ConnectionManagerClient from './manager_client';

const logger = GetLogger('SIO-Server-Client');

/** Class housing socket.io endpoint for clients */
export class SocketIOServerClient extends SocketIOServer {

	constructor(httpServer: HttpServer) {
		super(httpServer, {});
	}

	/**
	 * Handle new incoming connections
	 * @param socket - The newly connected socket
	 */
	protected onConnect(socket: Socket): SocketIOConnectionClient {
		const connection = new SocketIOConnectionClient(socket);
		if (!connection.isConnected()) {
			logger.fatal('Asserting failed: client disconnect before onConnect finished');
		}
		return connection;
	}

	protected override allowRequest(req: IncomingMessage, next: (err: string | null | undefined, success: boolean) => void): void {
		const [characterId, secret] = (req.headers.authorization || '').split(' ');
		if (!IsCharacterId(characterId) || !secret || !ConnectionManagerClient.isAuthorized(characterId, secret)) {
			next('Invalid authorization header', false);
			return;
		}
		next(undefined, true);
	}
}
