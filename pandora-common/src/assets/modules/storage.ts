import { Asset } from '../asset';
import { IAssetModuleDefinition, IItemModule, IModuleItemDataCommon, IModuleConfigCommon } from './common';
import { z } from 'zod';
import { AssetDefinitionExtraArgs, AssetSize, AssetSizeMapping } from '../definitions';
import { ConditionOperator } from '../graphics';
import { AssetProperties } from '../properties';
import { ItemInteractionType } from '../../character/restrictionsManager';
import { AppearanceItems, AppearanceValidationCombineResults, AppearanceValidationResult } from '../appearanceValidation';
import { IItemLoadContext, Item, ItemBundle, ItemBundleSchema } from '../item';
import { AssetManager } from '../assetManager';
import { ItemId } from '../appearanceTypes';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface IModuleConfigStorage<A extends AssetDefinitionExtraArgs = AssetDefinitionExtraArgs> extends IModuleConfigCommon<'storage'> {
	maxCount: number;
	maxAcceptedSize: AssetSize;
}

export interface IModuleItemDataStorage extends IModuleItemDataCommon<'storage'> {
	contents: ItemBundle[];
}
const ModuleItemDataStorageScheme = z.lazy(() => z.object({
	type: z.literal('storage'),
	contents: z.array(ItemBundleSchema),
}));

// Never used
export const ItemModuleStorageActionSchema = z.object({
	moduleType: z.literal('storage'),
});
type ItemModuleStorageAction = z.infer<typeof ItemModuleStorageActionSchema>;

export class StorageModuleDefinition implements IAssetModuleDefinition<'storage'> {

	public parseData(_asset: Asset, _moduleName: string, _config: IModuleConfigStorage, data: unknown): IModuleItemDataStorage {
		const parsed = ModuleItemDataStorageScheme.safeParse(data);
		return parsed.success ? parsed.data : {
			type: 'storage',
			contents: [],
		};
	}

	public loadModule(_asset: Asset, _moduleName: string, config: IModuleConfigStorage, data: IModuleItemDataStorage, context: IItemLoadContext): ItemModuleStorage {
		return new ItemModuleStorage(config, data, context);
	}

	public getStaticAttributes(_config: IModuleConfigStorage): ReadonlySet<string> {
		return new Set<string>();
	}
}

function ValidateStorage(contents: AppearanceItems, config: IModuleConfigStorage): AppearanceValidationResult {
	// Id must be unique
	const ids = new Set<ItemId>();
	for (const item of contents) {
		if (ids.has(item.id))
			return {
				success: false,
				error: {
					problem: 'invalid',
				},
			};
		ids.add(item.id);
	}

	// Count must be within limit
	if (contents.length > config.maxCount)
		return {
			success: false,
			error: {
				problem: 'tooManyItems',
				asset: null,
				limit: config.maxCount,
			},
		};

	// Size must be within limit
	const limitSize = AssetSizeMapping[config.maxAcceptedSize] ?? 0;
	const problematic = contents.find((i) => (AssetSizeMapping[i.asset.definition.size] ?? 99) > limitSize);
	if (problematic != null)
		return {
			success: false,
			error: {
				problem: 'contentNotAllowed',
				asset: problematic.asset.id,
			},
		};

	return contents.map((i) => i.validate(false))
		.reduce(AppearanceValidationCombineResults, { success: true });
}

export class ItemModuleStorage implements IItemModule<'storage'> {
	public readonly type = 'storage';

	private readonly assetMananger: AssetManager;
	public readonly config: IModuleConfigStorage;
	private readonly contents: AppearanceItems;

	public get interactionType(): ItemInteractionType {
		return ItemInteractionType.MODIFY;
	}

	constructor(config: IModuleConfigStorage, data: IModuleItemDataStorage, context: IItemLoadContext) {
		this.assetMananger = context.assetMananger;
		this.config = config;
		const content: Item[] = [];
		const limitSize = AssetSizeMapping[config.maxAcceptedSize] ?? 0;
		for (const itemBundle of data.contents) {
			// Load asset and skip if unknown
			const asset = this.assetMananger.getAssetById(itemBundle.asset);
			if (asset === undefined) {
				context.logger?.warning(`Skipping unknown asset ${itemBundle.asset}`);
				continue;
			}
			const item = new Item(
				itemBundle.id,
				asset,
				itemBundle,
				context,
			);

			if (context.doLoadTimeCleanup) {
				if (content.length >= config.maxCount) {
					context.logger?.warning(`Skipping stored item over count limit ${itemBundle.asset}`);
					continue;
				}
				// Skip if too large
				const assetSize = AssetSizeMapping[asset.definition.size] ?? 99;
				if (assetSize > limitSize) {
					context.logger?.warning(`Skipping stored item over size limit ${itemBundle.asset}`);
					continue;
				}
				// Skip if invalid
				if (!item.validate(false).success) {
					context.logger?.warning(`Skipping stored item reporting invalid ${itemBundle.asset}`);
					continue;
				}
			}

			content.push(item);
		}
		this.contents = content;
	}

	public exportData(): IModuleItemDataStorage {
		return {
			type: 'storage',
			contents: this.contents.map((item) => item.exportToBundle()),
		};
	}

	public validate(_isWorn: boolean): AppearanceValidationResult {
		return ValidateStorage(this.contents, this.config);
	}

	public getProperties(): AssetProperties {
		return {};
	}

	public evalCondition(_operator: ConditionOperator, _value: string): boolean {
		return false;
	}

	public doAction(_action: ItemModuleStorageAction): ItemModuleStorage | null {
		return null;
	}

	public readonly contentsPhysicallyEquipped: boolean = false;

	public getContents(): AppearanceItems {
		return this.contents;
	}

	public setContents(items: AppearanceItems): ItemModuleStorage | null {
		return new ItemModuleStorage(this.config, {
			type: 'storage',
			contents: items.map((item) => item.exportToBundle()),
		}, {
			assetMananger: this.assetMananger,
			doLoadTimeCleanup: false,
		});
	}
}