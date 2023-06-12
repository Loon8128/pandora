import { EvalItemPath } from './appearanceHelpers';
import type { ItemPath, RoomActionTargetRoomInventory } from './appearanceTypes';
import { AppearanceItems } from './appearanceValidation';
import { AssetManager } from './assetManager';
import { Item } from './item';
import { AssetFrameworkRoomState, RoomInventoryBundle } from './state/roomState';

export const ROOM_INVENTORY_BUNDLE_DEFAULT: RoomInventoryBundle = {
	items: [],
};

export class RoomInventory implements RoomActionTargetRoomInventory {
	public readonly roomState: AssetFrameworkRoomState;

	public readonly type = 'roomInventory';

	protected get assetManager(): AssetManager {
		return this.roomState.assetManager;
	}

	private get _items(): AppearanceItems {
		return this.roomState.items;
	}

	constructor(roomState: AssetFrameworkRoomState) {
		this.roomState = roomState;
	}

	public getAssetManager(): AssetManager {
		return this.assetManager;
	}

	public getItem(path: ItemPath): Item | undefined {
		return EvalItemPath(this._items, path);
	}

	public getAllItems(): readonly Item[] {
		return this._items;
	}
}