import { Immutable } from 'immer';
import { AppearanceLimitTree } from './appearanceLimit';
import type { AssetDefinitionExtraArgs, AssetDefinitionPoseLimits } from './definitions';
import { EffectsDefinition, EFFECTS_DEFAULT, MergeEffects } from './effects';

export interface AssetProperties<A extends AssetDefinitionExtraArgs = AssetDefinitionExtraArgs> {

	/** Configuration of how the asset limits pose */
	poseLimits?: AssetDefinitionPoseLimits<A>;

	/** The effects this item applies when worn */
	effects?: Partial<EffectsDefinition>;

	/** Attributes this asset gives */
	attributes?: (A['attributes'])[];

	/**
	 * Requirements needed to wear this item.
	 *
	 * Attributes provided by items __above__ this one in wear-order don't count.
	 * This item's own attributes _do_ count into requirements.
	 */
	requirements?: (A['attributes'] | `!${A['attributes']}`)[];

	/**
	 * Items that have any of these attributes are hidden by this item.
	 * Applies only to items __bellow__ this one in wear-order.
	 */
	hides?: (A['attributes'])[];

	/**
	 * Prevents this item from being added or removed on anyone, including on oneself
	 * @default false
	 */
	blockAddRemove?: boolean;

	/**
	 * Prevents this item from being added or removed by a character on herself
	 * @default false
	 */
	blockSelfAddRemove?: boolean;

	/**
	 * Prevents listed modules from being modified by anyone, including on oneself
	 * @default []
	 */
	blockModules?: string[];

	/**
	 * Prevents listed modules from being modified by anyone wearing this item
	 * @default []
	 */
	blockSelfModules?: string[];

	/**
	 * Prevents items that use these slots from being present on top of this item
	 * @default []
	 */
	blockSlots?: (A['slots'])[];

	/**
	 * Prevents items that use these slots and are below this item from being modified
	 * @default []
	 */
	coverSlots?: (A['slots'])[];

	/**
	 * Unique list of slots this item occupies and or requires to be occupied
	 * @default {}
	 *
	 * { <slot>: <n> } occupies this slot partially, with n being how much of the slot is occupied
	 *                 n == 0, slot is not occupied but block is still applied
	 */
	occupySlots?: Partial<Record<A['slots'], number>>;

	/**
	 * A unique list of color keys that disable user colorization.
	 * By default, colorization that has a name is user configured,
	 * specifying the color key in this list will make the inheritance group a higher priority
	 * thereby disabling user colorization and the color will be inherited from the group.
	 *
	 * @default []
	 */
	overrideColorKey?: string[];

	/**
	 * A unique list of color keys for which color inheritance is excluded.
	 * If an item is excluded from color inheritance for a particular key,
	 * it will not serve as a source of color for other items with that inheritance group.
	 *
	 * @default []
	 */
	excludeFromColorInheritance?: string[];
}

export interface AssetLockProperties<__satisfies__Placeholder extends AssetDefinitionExtraArgs = AssetDefinitionExtraArgs> {
	/**
	 * Prevents actions against the lock from the character herself
	 * @default false
	 */
	blockSelf?: boolean;
}

export interface AssetSlotResult {
	occupied: Map<string, number>;
	covered: Set<string>;
	blocked: Set<string>;
}

export interface AssetPropertiesResult {
	limits: AppearanceLimitTree;
	effects: EffectsDefinition;
	attributes: Set<string>;
	hides: Set<string>;
	slots: AssetSlotResult;
}

export function CreateAssetPropertiesResult(): AssetPropertiesResult {
	return {
		limits: new AppearanceLimitTree(),
		effects: EFFECTS_DEFAULT,
		attributes: new Set(),
		hides: new Set(),
		slots: {
			occupied: new Map(),
			covered: new Set(),
			blocked: new Set(),
		},
	};
}

export function MergeAssetProperties<T extends AssetPropertiesResult>(base: T, properties: Immutable<AssetProperties>): T {
	base.limits.merge(properties.poseLimits);
	base.effects = MergeEffects(base.effects, properties.effects);
	properties.attributes?.forEach((a) => base.attributes.add(a));
	properties.hides?.forEach((a) => base.hides.add(a));
	for (const [slot, amount] of Object.entries(properties.occupySlots ?? {})) {
		base.slots.occupied.set(slot, (base.slots.occupied.get(slot) ?? 0) + (amount ?? 0));
	}
	properties.coverSlots?.forEach((s) => base.slots.covered.add(s));
	properties.blockSlots?.forEach((s) => base.slots.blocked.add(s));

	return base;
}

export interface AssetPropertiesIndividualResult extends AssetPropertiesResult {
	requirements: Set<string | `!${string}`>;
	blockAddRemove: boolean;
	blockSelfAddRemove: boolean;
	blockModules: Set<string>;
	blockSelfModules: Set<string>;
	overrideColorKey: Set<string>;
	excludeFromColorInheritance: Set<string>;
}

export function CreateAssetPropertiesIndividualResult(): AssetPropertiesIndividualResult {
	return {
		...CreateAssetPropertiesResult(),
		requirements: new Set(),
		blockAddRemove: false,
		blockSelfAddRemove: false,
		blockModules: new Set(),
		blockSelfModules: new Set(),
		overrideColorKey: new Set(),
		excludeFromColorInheritance: new Set(),
	};
}

export function MergeAssetPropertiesIndividual(base: AssetPropertiesIndividualResult, properties: Immutable<AssetProperties>): AssetPropertiesIndividualResult {
	base = MergeAssetProperties(base, properties);
	properties.requirements?.forEach((a) => base.requirements.add(a));
	base.blockAddRemove ||= properties.blockAddRemove ?? false;
	base.blockSelfAddRemove ||= properties.blockSelfAddRemove ?? false;
	properties.blockModules?.forEach((a) => base.blockModules.add(a));
	properties.blockSelfModules?.forEach((a) => base.blockSelfModules.add(a));
	properties.overrideColorKey?.forEach((a) => base.overrideColorKey.add(a));
	properties.excludeFromColorInheritance?.forEach((a) => base.excludeFromColorInheritance.add(a));

	return base;
}
