import { Appearance, AppearanceActionContext, APPEARANCE_BUNDLE_DEFAULT, AssertNever, AssetManager, CharacterId, GetLogger, ICharacterData, ICharacterDataUpdate, ICharacterPublicData, ICharacterPublicSettings, IChatRoomMessage, IShardCharacterDefinition, Logger, RoomId, CHARACTER_DEFAULT_PUBLIC_SETTINGS } from 'pandora-common';
import { DirectoryConnector } from '../networking/socketio_directory_connector';
import { CharacterManager, CHARACTER_TIMEOUT } from './characterManager';
import type { Room } from '../room/room';
import { RoomManager } from '../room/roomManager';
import { GetDatabase } from '../database/databaseProvider';
import { IConnectionClient } from '../networking/common';
import { assetManager } from '../assets/assetManager';
import _ from 'lodash';

export const enum CharacterModification {
	NONE = 0,
	MODIFIED = 1,
	PENDING = 2,
}

type ICharacterDataChange = Omit<ICharacterDataUpdate, 'id' | 'appearance'>;
type ICharacterPublicDataChange = Omit<ICharacterPublicData, 'id' | 'appearance'>;
type ICharacterPrivateDataChange = Omit<ICharacterDataUpdate, keyof ICharacterPublicData>;

export class Character {
	private readonly data: Omit<ICharacterData, 'appearance'>;
	public connectSecret: string;

	public readonly appearance: Appearance = new Appearance(assetManager);

	private state = CharacterModification.NONE;
	private modified: Set<keyof ICharacterDataChange | 'appearance'> = new Set();

	public connection: IConnectionClient | null = null;
	private invalid: null | 'timeout' | 'error' | 'remove' = null;
	private timeout: NodeJS.Timeout | null = null;

	public room: Room | null = null;

	public get id(): CharacterId {
		return this.data.id;
	}

	public get name(): string {
		return this.data.name;
	}

	public get accountId(): number {
		return this.data.accountId;
	}

	public get accessId(): string {
		return this.data.accessId;
	}

	public get isInCreation(): boolean {
		return this.data.inCreation === true;
	}

	public get isValid(): boolean {
		return this.invalid === null;
	}

	public get settings(): Readonly<ICharacterPublicSettings> {
		return this.data.settings;
	}

	private logger: Logger;

	constructor(data: ICharacterData, connectSecret: string, room: RoomId | null) {
		this.logger = GetLogger('Character', `[Character ${data.id}]`);
		this.data = data;

		// TODO: remove this, this allow easier development so no need for DB migration
		this.data.settings = {
			..._.cloneDeep(CHARACTER_DEFAULT_PUBLIC_SETTINGS),
			...(this.data.settings ?? {}),
		};

		this.connectSecret = connectSecret;
		this.setConnection(null);
		this.linkRoom(room);

		this.appearance.importFromBundle(data.appearance ?? APPEARANCE_BUNDLE_DEFAULT, this.logger.prefixMessages('Appearance load:'));
		this.appearance.onChangeHandler = this.onAppearanceChanged.bind(this);
	}

	public reloadAssetManager(manager: AssetManager) {
		this.appearance.reloadAssetManager(manager, this.logger.prefixMessages('Appearance manager reload:'));
	}

	public update(data: IShardCharacterDefinition) {
		if (data.id !== this.data.id) {
			throw new Error('Character update changes id');
		}
		if (data.account !== this.data.accountId) {
			throw new Error('Character update changes account');
		}
		if (data.accessId !== this.data.accessId) {
			this.logger.warning('Access id changed! This could be a bug');
			this.data.accessId = data.accessId;
		}
		if (data.connectSecret !== this.connectSecret) {
			this.logger.debug('Connection secret changed');
			this.connectSecret = data.connectSecret;
			if (this.connection) {
				this.connection.abortConnection();
			}
		}
		this.linkRoom(data.room);
	}

	private linkRoom(id: RoomId | null): void {
		let room: Room | null = null;
		if (id != null) {
			room = RoomManager.getRoom(id) ?? null;
			if (!room) {
				this.logger.error(`Failed to link character to room ${id}; not found`);
			}
		}
		if (this.room !== room) {
			this.room?.characterLeave(this);
			room?.characterEnter(this);
		}
	}

	public isInUse(): boolean {
		return this.connection !== undefined;
	}

	public setConnection(connection: IConnectionClient | null): void {
		if (this.invalid) {
			AssertNever();
		}
		if (this.timeout !== null) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		const oldConnection = this.connection;
		this.connection = null;
		if (oldConnection && oldConnection !== connection) {
			this.logger.debug(`Disconnected (${oldConnection.id})`);
			oldConnection.character = null;
			oldConnection.abortConnection();
		}
		if (connection) {
			this.logger.debug(`Connected (${connection.id})`);
			connection.character = this;
			this.connection = connection;
		} else if (this.isValid) {
			this.timeout = setTimeout(this.handleTimeout.bind(this), CHARACTER_TIMEOUT);
		}
	}

	private handleTimeout(): void {
		if (this.invalid) {
			AssertNever();
		}
		this.logger.verbose('Timed out');
		this.invalidate('timeout');
	}

	public async finishCreation(name: string): Promise<boolean> {
		if (!this.data.inCreation)
			return false;

		this.setValue('name', name, true);
		await this.save();

		if (!this.modified.has('name')) {
			const { created } = await DirectoryConnector.awaitResponse('createCharacter', { id: this.data.id });
			this.data.created = created;
			this.data.inCreation = undefined;
			this.connection?.sendMessage('updateCharacter', {
				created,
			});
			return true;
		}

		return false;
	}

	public async saveAndDisconnect(): Promise<void> {
		this.invalidate('remove');
		try {
			await this.save();
		} finally {
			CharacterManager.removeCharacter(this.id);
		}
	}

	public onRemove(): void {
		this.room?.characterLeave(this);
		this.state = CharacterModification.NONE;
		this.modified.clear();
		this.invalidate('remove');
	}

	private invalidate(reason: 'timeout' | 'error' | 'remove'): void {
		if (this.invalid !== null)
			return;
		this.invalid = reason;
		const oldConnection = this.connection;
		this.connection = null;
		if (oldConnection) {
			this.logger.debug(`Disconnected during invalidation (${oldConnection.id})`);
			oldConnection.character = null;
			oldConnection.abortConnection();
		}
		if (this.timeout !== null) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		if (reason !== 'remove') {
			DirectoryConnector.sendMessage('characterDisconnect', { id: this.id, reason });
		}
	}

	public static async load(id: CharacterId, accessId: string): Promise<ICharacterData | null> {
		const character = await GetDatabase().getCharacter(id, accessId);
		if (character === false) {
			return null;
		}
		return character;
	}

	public getData(): ICharacterData {
		return {
			...this.data,
			appearance: this.appearance.exportToBundle(),
		};
	}

	public getAppearanceActionContext(): AppearanceActionContext {
		const characters = new Map<CharacterId, Appearance>();
		if (this.room) {
			for (const char of this.room.getAllCharacters()) {
				characters.set(char.id, char.appearance);
			}
		}
		characters.set(this.id, this.appearance);
		return {
			player: this.id,
			characters,
			roomInventory: null,
		};
	}

	public async save(): Promise<void> {
		if (this.state !== CharacterModification.MODIFIED)
			return;

		this.state = CharacterModification.PENDING;
		const keys: (keyof Omit<ICharacterDataUpdate, 'id'>)[] = [...this.modified];
		this.modified.clear();

		const data: ICharacterDataUpdate = {
			id: this.data.id,
			accessId: this.data.accessId,
		};

		for (const key of keys) {
			if (key === 'appearance') {
				data.appearance = this.appearance.exportToBundle();
			} else {
				(data as Record<string, unknown>)[key] = this.data[key];
			}
		}

		if (await GetDatabase().setCharacter(data)) {
			if (this.state === CharacterModification.PENDING)
				this.state = CharacterModification.NONE;
		} else {
			for (const key of keys) {
				this.modified.add(key);
			}
			this.state = CharacterModification.MODIFIED;
		}
	}

	private setValue<Key extends keyof ICharacterPublicDataChange>(key: Key, value: ICharacterData[Key], room: true): void;
	private setValue<Key extends keyof ICharacterPrivateDataChange>(key: Key, value: ICharacterData[Key], room: false): void;
	private setValue<Key extends keyof ICharacterDataChange>(key: Key, value: ICharacterData[Key], room: boolean): void {
		if (this.data[key] === value)
			return;

		this.data[key] = value;
		this.modified.add(key);
		this.state = CharacterModification.MODIFIED;

		if (room && this.room) {
			this.room.sendUpdateToAllInRoom();
		} else {
			this.connection?.sendMessage('updateCharacter', { [key]: value });
		}
	}

	private onAppearanceChanged(): void {
		this.modified.add('appearance');
		this.state = CharacterModification.MODIFIED;

		if (this.room) {
			this.room.sendUpdateToAllInRoom();
		} else {
			this.connection?.sendMessage('updateCharacter', { appearance: this.appearance.exportToBundle() });
		}
	}

	public sendUpdate(): void {
		if (this.room) {
			this.room.sendUpdateTo(this);
		} else {
			this.connection?.sendMessage('updateCharacter', { appearance: this.appearance.exportToBundle() });
		}
	}

	public setPublicSettings(settings: Partial<ICharacterPublicSettings>): void {
		this.setValue('settings', {
			...this.settings,
			...settings,
		}, true);
	}

	//#region Chat messages

	private messageQueue: IChatRoomMessage[] = [];

	public queueMessages(messages: IChatRoomMessage[]): void {
		if (messages.length === 0)
			return;
		this.messageQueue.push(...messages);
		this.connection?.sendMessage('chatRoomMessage', {
			messages,
		});
	}

	public onMessageAck(time: number): void {
		const nextIndex = this.messageQueue.findIndex((m) => m.time > time);
		if (nextIndex < 0) {
			this.messageQueue = [];
		} else {
			this.messageQueue.splice(0, nextIndex);
		}
	}

	public sendAllPendingMessages(): void {
		this.connection?.sendMessage('chatRoomMessage', {
			messages: this.messageQueue,
		});
	}

	//#endregion
}
