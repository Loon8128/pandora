import type { AccountRole, IAccountRoleInfo } from '../account';
import type { CharacterId } from '../character';
import type { SocketInterface, RecordOnly, SocketInterfaceArgs, SocketInterfaceUnconfirmedArgs, SocketInterfaceResult, SocketInterfaceResponseHandler, SocketInterfaceOneshotHandler, SocketInterfaceNormalResult, SocketInterfacePromiseResult } from './helpers';
import type { MessageHandler } from './message_handler';
import type { ShardFeature } from './shard_directory';

export type IDirectoryStatus = {
	time: number;
	betaKeyRequired?: true;
};

export type IDirectoryAccountSettings = {
	visibleRoles: AccountRole[];
};

export type IDirectoryAccountInfo = {
	id: number;
	username: string;
	created: number;
	github?: { id: number; login: string; };
	roles?: IAccountRoleInfo;
	settings: IDirectoryAccountSettings;
};

export type IDirectoryShardInfo = {
	id: string;
	publicURL: string;
	features: ShardFeature[];
	version: string;
};

export type IDirectoryCharacterConnectionInfo = {
	characterId: CharacterId;
	secret: string;
} & IDirectoryShardInfo;

export type IDirectoryClientChangeEvents = 'characterList' | 'shardList' | 'roomList';

/** Directory->Client handlers */
interface DirectoryClient {
	/** Generic message for Directory's current status */
	serverStatus(arg: IDirectoryStatus): void;

	connectionState(arg: {
		account: IDirectoryAccountInfo | null,
		character: IDirectoryCharacterConnectionInfo | null,
	}): void;
	somethingChanged(arg: {
		changes: IDirectoryClientChangeEvents[];
	}): void;
}

export type IDirectoryClient = SocketInterface<DirectoryClient>;
export type IDirectoryClientArgument = RecordOnly<SocketInterfaceArgs<DirectoryClient>>;
export type IDirectoryClientUnconfirmedArgument = SocketInterfaceUnconfirmedArgs<DirectoryClient>;
export type IDirectoryClientResult = SocketInterfaceResult<DirectoryClient>;
export type IDirectoryClientPromiseResult = SocketInterfacePromiseResult<DirectoryClient>;
export type IDirectoryClientNormalResult = SocketInterfaceNormalResult<DirectoryClient>;
export type IDirectoryClientResponseHandler = SocketInterfaceResponseHandler<DirectoryClient>;
export type IDirectoryClientOneshotHandler = SocketInterfaceOneshotHandler<DirectoryClient>;
export type IDirectoryClientMessageHandler<Context> = MessageHandler<DirectoryClient, Context>;
export type IDirectoryClientBase = DirectoryClient;
