import classNames from 'classnames';
import { nanoid } from 'nanoid';
import {
	CharacterAppearance,
	AppearanceAction,
	AppearanceActionContext,
	AppearanceItems,
	AppearanceItemsGetPoseLimits,
	ArmsPose,
	AssertNotNullable,
	Asset,
	AssetsPosePresets,
	BoneName,
	BoneState,
	BONE_MAX,
	BONE_MIN,
	CharacterView,
	DoAppearanceAction,
	IsCharacterId,
	IsObject,
	Item,
	ItemId,
	ItemContainerPath,
	RoomTargetSelector,
	ItemPath,
	Assert,
	AppearanceActionResult,
} from 'pandora-common';
import React, { createContext, ReactElement, ReactNode, RefObject, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GetAssetManager } from '../../assets/assetManager';
import { Character, useCharacterAppearanceArmsPose, useCharacterAppearanceItem, useCharacterAppearanceItems, useCharacterAppearancePose, useCharacterAppearanceView } from '../../character/character';
import { useObservable } from '../../observable';
import './wardrobe.scss';
import { useShardConnector } from '../gameContext/shardConnectorContextProvider';
import { useAppearanceActionRoomContext, useCharacterRestrictionsManager, useChatRoomCharacters } from '../gameContext/chatRoomContextProvider';
import { usePlayer } from '../gameContext/playerContextProvider';
import type { PlayerCharacter } from '../../character/player';
import { Tab, TabContainer } from '../common/tabs/tabs';
import { FieldsetToggle } from '../common/fieldsetToggle';
import { Button } from '../common/Button/Button';
import { USER_DEBUG } from '../../config/Environment';
import _ from 'lodash';
import { CommonProps } from '../../common/reactTypes';
import { useEvent } from '../../common/useEvent';
import { ItemModuleTyped } from 'pandora-common/dist/assets/modules/typed';
import { IItemModule } from 'pandora-common/dist/assets/modules/common';
import { GraphicsScene } from '../../graphics/graphicsScene';
import { GraphicsCharacter } from '../../graphics/graphicsCharacter';
import { ColorInput } from '../common/colorInput/colorInput';
import { Column, Row } from '../common/container/container';
import { ItemModuleStorage } from 'pandora-common/dist/assets/modules/storage';
import { ItemModuleLockSlot } from 'pandora-common/dist/assets/modules/lockSlot';
import { SplitContainerPath } from 'pandora-common/dist/assets/appearanceHelpers';
import emptyLock from '../../assets/icons/lock_empty.svg';
import closedLock from '../../assets/icons/lock_closed.svg';
import openLock from '../../assets/icons/lock_open.svg';
import { AppearanceActionResultShouldHide, RenderAppearanceActionResult } from '../../assets/appearanceValidation';
import { HoverElement } from '../hoverElement/hoverElement';

export function WardrobeScreen(): ReactElement | null {
	const locationState = useLocation().state as unknown;
	const player = usePlayer();
	const chatRoomCharacters = useChatRoomCharacters();

	const characterId = IsObject(locationState) && IsCharacterId(locationState.character) ? locationState.character : null;

	const [character, setCharacter] = useState<Character | null>(null);

	useEffect(() => {
		if (characterId == null || characterId === player?.data.id) {
			setCharacter(player);
			return;
		}
		const get = () => chatRoomCharacters?.find((c) => c.data.id === characterId) ?? null;
		setCharacter(get());
	}, [setCharacter, characterId, player, chatRoomCharacters]);

	if (!character?.data || !player)
		return <Link to='/pandora_lobby'>◄ Back</Link>;

	return (
		<WardrobeContextProvider character={ character } player={ player }>
			<Wardrobe />
		</WardrobeContextProvider>
	);
}

interface WardrobeContext {
	character: Character;
	target: RoomTargetSelector;
	assetList: readonly Asset[];
	actions: AppearanceActionContext;
}

interface WardrobeFocus {
	container: ItemContainerPath;
	itemId: ItemId | null;
}

function WardrobeFocusesItem(focus: WardrobeFocus): focus is ItemPath {
	return focus.itemId != null;
}

const wardrobeContext = createContext<WardrobeContext | null>(null);

export function WardrobeContextProvider({ character, player, children }: { character: Character, player: PlayerCharacter, children: ReactNode }): ReactElement {
	const assetList = useObservable(GetAssetManager().assetList);
	const roomContext = useAppearanceActionRoomContext();

	const actions = useMemo<AppearanceActionContext>(() => ({
		player: player.data.id,
		getCharacter: (id) => {
			if (id === player.data.id) {
				return player.getRestrictionManager(roomContext);
			} else if (id === character.data.id) {
				return character.getRestrictionManager(roomContext);
			}
			return null;
		},
		getTarget: (target) => {
			if (target.type === 'character') {
				if (target.characterId === player.data.id) {
					return player.appearance;
				} else if (target.characterId === character.data.id) {
					return character.appearance;
				}
			}
			return null;
		},
	}), [character, player, roomContext]);

	const context = useMemo<WardrobeContext>(() => ({
		character,
		target: {
			type: 'character',
			characterId: character.data.id,
		},
		assetList,
		actions,
	}), [character, assetList, actions]);

	return (
		<wardrobeContext.Provider value={ context }>
			{ children }
		</wardrobeContext.Provider>
	);
}

function useWardrobeContext(): Readonly<WardrobeContext> {
	const ctx = useContext(wardrobeContext);
	AssertNotNullable(ctx);
	return ctx;
}

function Wardrobe(): ReactElement | null {
	const { character } = useWardrobeContext();
	const shardConnector = useShardConnector();
	const navigate = useNavigate();

	const overlay = (
		<div className='overlay'>
			<Button className='slim iconButton'
				title='Toggle character view'
				onClick={ () => {
					shardConnector?.sendMessage('appearanceAction', {
						type: 'setView',
						target: character.data.id,
						view: character.appearance.getView() === CharacterView.FRONT ? CharacterView.BACK : CharacterView.FRONT,
					});
				} }
			>
				↷
			</Button>
		</div>
	);

	return (
		<div className='wardrobe'>
			<GraphicsScene className='characterPreview' divChildren={ overlay }>
				<GraphicsCharacter appearanceContainer={ character } />
			</GraphicsScene>
			<TabContainer className='flex-1'>
				<Tab name='Items'>
					<div className='wardrobe-pane'>
						<WardrobeItemManipulation />
					</div>
				</Tab>
				<Tab name='Body'>
					<div className='wardrobe-pane'>
						<WardrobeBodyManipulation />
					</div>
				</Tab>
				<Tab name='Poses & Expressions'>
					<div className='wardrobe-pane'>
						<div className='wardrobe-ui'>
							<WardrobePoseGui character={ character } />
							<WardrobeExpressionGui />
						</div>
					</div>
				</Tab>
				<Tab name='Outfits'>
					<div className='wardrobe-pane'>
						<div className='center-flex flex-1'>
							TODO
						</div>
					</div>
				</Tab>
				<Tab name='◄ Back' className='slim' onClick={ () => navigate(-1) } />
			</TabContainer>
		</div>
	);
}

function WardrobeItemManipulation({ className }: { className?: string }): ReactElement {
	const { character, assetList } = useWardrobeContext();

	const [currentFocus, setFocus] = useState<WardrobeFocus>({ container: [], itemId: null });

	const preFilter = useCallback((item: Item | Asset) => {
		const { definition } = 'asset' in item ? item.asset : item;
		return definition.bodypart === undefined && (currentFocus.container.length !== 0 || definition.wearable !== false);
	}, [currentFocus]);

	const containerPath = useMemo(() => SplitContainerPath(currentFocus.container), [currentFocus.container]);
	const containerItem = useCharacterAppearanceItem(character, containerPath?.itemPath);
	const containerContentsFilter = useMemo<(asset: Asset) => boolean>(() => {
		const module = containerPath ? containerItem?.modules.get(containerPath.module) : undefined;
		return module?.acceptedContentFilter?.bind(module) ?? (() => true);
	}, [containerPath, containerItem]);

	return (
		<div className={ classNames('wardrobe-ui', className) }>
			<InventoryItemView
				title='Currently worn items'
				filter={ preFilter }
				focus={ currentFocus }
				setFocus={ setFocus }
			/>
			<TabContainer className={ classNames('flex-1', WardrobeFocusesItem(currentFocus) && 'hidden') }>
				<Tab name='Create new item'>
					<InventoryAssetView title='Create and use a new item' assets={ assetList.filter((asset) => {
						return preFilter(asset) && containerContentsFilter(asset);
					}) } container={ currentFocus.container } />
				</Tab>
				<Tab name='Room inventory'>
					<div className='inventoryView'>
						<div className='center-flex flex-1'>
							TODO
						</div>
					</div>
				</Tab>
				<Tab name='Recent items'>
					<div className='inventoryView'>
						<div className='center-flex flex-1'>
							TODO
						</div>
					</div>
				</Tab>
				<Tab name='Saved items'>
					<div className='inventoryView'>
						<div className='center-flex flex-1'>
							TODO
						</div>
					</div>
				</Tab>
			</TabContainer>
			{
				WardrobeFocusesItem(currentFocus) &&
				<div className='flex-col flex-1'>
					<WardrobeItemConfigMenu key={ currentFocus.itemId } item={ currentFocus } setFocus={ setFocus } />
				</div>
			}
		</div>
	);
}

function WardrobeBodyManipulation({ className }: { className?: string }): ReactElement {
	const { assetList } = useWardrobeContext();

	const filter = (item: Item | Asset) => {
		const { definition } = 'asset' in item ? item.asset : item;
		return definition.bodypart !== undefined;
	};

	const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
	const currentFocus = useMemo<WardrobeFocus>(() => ({
		container: [],
		itemId: selectedItemId,
	}), [selectedItemId]);

	// Reset selected item each time screen opens
	useLayoutEffect(() => {
		setSelectedItemId(null);
	}, []);

	const setFocus = useCallback((newFocus: WardrobeFocus) => {
		Assert(newFocus.container.length === 0, 'Body cannot have containers');
		setSelectedItemId(newFocus.itemId);
	}, []);

	return (
		<div className={ classNames('wardrobe-ui', className) }>
			<InventoryItemView title='Currently worn items' filter={ filter } focus={ currentFocus } setFocus={ setFocus } />
			<TabContainer className={ classNames('flex-1', WardrobeFocusesItem(currentFocus) && 'hidden') }>
				<Tab name='Change body parts'>
					<InventoryAssetView title='Add a new bodypart' assets={ assetList.filter(filter) } container={ [] } />
				</Tab>
				<Tab name='Change body size'>
					<WardrobeBodySizeEditor />
				</Tab>
			</TabContainer>
			{
				WardrobeFocusesItem(currentFocus) &&
				<div className='flex-col flex-1'>
					<WardrobeItemConfigMenu key={ currentFocus.itemId } item={ currentFocus } setFocus={ setFocus } />
				</div>
			}
		</div>
	);
}

function InventoryAssetView({ className, title, children, assets, container }: {
	className?: string;
	title: string;
	children?: ReactNode;
	assets: readonly Asset[];
	container: ItemContainerPath;
}): ReactElement | null {
	const [listMode, setListMode] = useState(true);
	const [filter, setFilter] = useState('');
	const flt = filter.toLowerCase().trim().split(/\s+/);

	const filteredAssets = assets.filter((asset) => flt.every((f) => {
		return asset.definition.name.toLowerCase().includes(f);
	}));

	const filterInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Handler to autofocus search
		const keyPressHandler = (ev: KeyboardEvent) => {
			if (
				filterInput.current &&
				// Only if no other input is selected
				(!document.activeElement || !(document.activeElement instanceof HTMLInputElement)) &&
				// Only if this isn't a special key or key combo
				!ev.ctrlKey &&
				!ev.metaKey &&
				!ev.altKey &&
				ev.key.length === 1
			) {
				filterInput.current.focus();
			}
		};
		window.addEventListener('keypress', keyPressHandler);
		return () => {
			window.removeEventListener('keypress', keyPressHandler);
		};
	}, []);

	// Clear filter when looking from different focus
	useEffect(() => {
		setFilter('');
	}, [container, setFilter]);

	return (
		<div className={ classNames('inventoryView', className) }>
			<div className='toolbar'>
				<span>{title}</span>
				<input ref={ filterInput }
					type='text'
					placeholder='Filter assets'
					value={ filter }
					onChange={ (e) => setFilter(e.target.value) }
				/>
				<button onClick={ () => setListMode(false) } className={ listMode ? '' : 'active' }>Grid</button>
				<button onClick={ () => setListMode(true) } className={ listMode ? 'active' : ''  }>List</button>
			</div>
			{ children }
			<div className={ listMode ? 'list' : 'grid' }>
				{ filteredAssets.map((a) => <InventoryAssetViewList key={ a.id } asset={ a } container={ container } listMode={ listMode } />) }
			</div>
		</div>
	);
}

function ActionWarning({ check, parent }: { check: AppearanceActionResult; parent: RefObject<HTMLElement> }) {
	const assetManager = GetAssetManager();
	const reason =  useMemo(() => check.result === 'success'
		? ''
		: RenderAppearanceActionResult(assetManager, check),
	[assetManager, check]);

	if (check.result === 'success') {
		return null;
	}

	return (
		<HoverElement parent={ parent } className='action-warning'>
			This action isn&apos;t possible, because:
			<br />
			{ reason }
		</HoverElement>
	);
}

function InventoryAssetViewList({ asset, container, listMode }: { asset: Asset; container: ItemContainerPath; listMode: boolean; }): ReactElement {
	const { actions, target } = useWardrobeContext();

	const action: AppearanceAction = {
		type: 'create',
		target,
		itemId: `i/${nanoid()}` as const,
		asset: asset.id,
		container,
	};

	const shardConnector = useShardConnector();
	const check = DoAppearanceAction(action, actions, GetAssetManager(), { dryRun: true });
	const ref = useRef<HTMLDivElement>(null);
	return (
		<div
			className={ classNames('inventoryViewItem', listMode ? 'listMode' : 'gridMode', check.result === 'success' ? 'allowed' : 'blocked') }
			ref={ ref }
			onClick={ () => {
				if (check.result === 'success') {
					shardConnector?.sendMessage('appearanceAction', action);
				}
			} }>
			<ActionWarning check={ check } parent={ ref } />
			<div className='itemPreview' />
			<span className='itemName'>{asset.definition.name}</span>
		</div>
	);
}

function InventoryItemView({
	className,
	title,
	filter,
	focus = { container: [], itemId: null },
	setFocus,
}: {
	className?: string;
	title: string;
	filter?: (item: Item) => boolean;
	focus?: WardrobeFocus;
	setFocus?: (newFocus: WardrobeFocus) => void;
}): ReactElement | null {
	const { character } = useWardrobeContext();
	const appearance = useCharacterAppearanceItems(character);

	const [displayedItems, containerModule, containerSteps] = useMemo<[AppearanceItems, IItemModule | undefined, readonly string[]]>(() => {
		let items: AppearanceItems = filter ? appearance.filter(filter) : appearance;
		let container: IItemModule | undefined;
		const steps: string[] = [];
		for (const step of focus.container) {
			const item = items.find((it) => it.id === step.item);
			const module = item?.modules.get(step.module);
			if (!item || !module)
				return [[], undefined, []];
			steps.push(`${item.asset.definition.name} (${module.config.name})`);
			container = module;
			items = item.getModuleItems(step.module);
		}
		return [items, container, steps];
	}, [appearance, filter, focus]);

	const singleItemContainer = containerModule != null && containerModule instanceof ItemModuleLockSlot;
	useEffect(() => {
		if (!singleItemContainer)
			return;
		if (displayedItems.length === 1 && focus.itemId == null) {
			setFocus?.({ ...focus, itemId: displayedItems[0].id });
		} else if (displayedItems.length === 0 && focus.itemId != null) {
			setFocus?.({ ...focus, itemId: null });
		}
	}, [focus, setFocus, singleItemContainer, displayedItems]);

	return (
		<div className={ classNames('inventoryView', className) }>
			<div className='toolbar'>
				{
					focus.container.length > 0 ? (
						<>
							<button onClick={ () => {
								const prev = SplitContainerPath(focus.container)?.itemPath;
								setFocus?.(prev ?? { container: [], itemId: null });
							} } >
								Close
							</button>
							<div className='center-flex'>
								Viewing contents of: <br />
								{ containerSteps.join(' > ') }
							</div>
						</>
					) :
						<span>{title}</span>
				}
			</div>
			<div className='list'>
				{
					displayedItems.map((i) => (
						<InventoryItemViewList key={ i.id }
							item={ { container: focus.container, itemId: i.id } }
							selected={ i.id === focus.itemId }
							setFocus={ setFocus }
							singleItemContainer={ singleItemContainer }
						/>
					))
				}
			</div>
		</div>
	);
}

function InventoryItemViewList({ item, selected=false, setFocus, singleItemContainer=false }: {
	item: ItemPath;
	selected?: boolean;
	setFocus?: (newFocus: WardrobeFocus) => void;
	singleItemContainer?: boolean;
}): ReactElement {
	const { target, character } = useWardrobeContext();
	const wornItem = useCharacterAppearanceItem(character, item);

	if (!wornItem) {
		return <div className='inventoryViewItem listMode blocked'>[ ERROR: ITEM NOT FOUND ]</div>;
	}

	const asset = wornItem.asset;

	return (
		<div className={ classNames('inventoryViewItem', 'listMode', selected && 'selected', 'allowed') } onClick={ () => {
			if (singleItemContainer)
				return;
			setFocus?.({
				container: item.container,
				itemId: selected ? null : item.itemId,
			});
		} }>
			<div className='itemPreview' />
			<span className='itemName'>{asset.definition.name}</span>
			<div className='quickActions'>
				{
					singleItemContainer ? null : (
						<>
							<WardrobeActionButton action={ {
								type: 'move',
								target,
								item,
								shift: 1,
							} } hideReserveSpace>
								⬇️
							</WardrobeActionButton>
							<WardrobeActionButton action={ {
								type: 'move',
								target,
								item,
								shift: -1,
							} } hideReserveSpace>
								⬆️
							</WardrobeActionButton>
						</>
					)
				}
				<WardrobeActionButton action={ {
					type: 'delete',
					target,
					item,
				} } hideReserveSpace>
					➖
				</WardrobeActionButton>
			</div>
		</div>
	);
}

function WardrobeActionButton({
	id,
	className,
	children,
	action,
	hideReserveSpace = false,
}: CommonProps & {
	action: AppearanceAction;
	/** Makes the button hide if it should in a way, that occupied space is preserved */
	hideReserveSpace?: boolean;
}): ReactElement {
	const { actions } = useWardrobeContext();
	const shardConnector = useShardConnector();

	const check = DoAppearanceAction(action, actions, GetAssetManager(), { dryRun: true });
	const hide = AppearanceActionResultShouldHide(check);
	const ref = useRef<HTMLButtonElement>(null);

	return (
		<button
			id={ id }
			ref={ ref }
			className={ classNames('wardrobeActionButton', className, check.result === 'success' ? 'allowed' : 'blocked', hide ? (hideReserveSpace ? 'invisible' : 'hidden') : null) }
			onClick={ (ev) => {
				ev.stopPropagation();
				if (check.result === 'success') {
					shardConnector?.sendMessage('appearanceAction', action);
				}
			} }
		>
			<ActionWarning check={ check } parent={ ref } />
			{ children }
		</button>
	);
}

function WardrobeItemConfigMenu({
	item,
	setFocus,
}: {
	item: ItemPath;
	setFocus: (newFocus: WardrobeFocus) => void;
}): ReactElement {
	const { target, character } = useWardrobeContext();
	const shardConnector = useShardConnector();
	const player = usePlayer();
	AssertNotNullable(player);
	const canUseHands = useCharacterRestrictionsManager(player, (manager) => manager.canUseHands());
	const wornItem = useCharacterAppearanceItem(character, item);

	const containerPath = SplitContainerPath(item.container);
	const containerItem = useCharacterAppearanceItem(character, containerPath?.itemPath);
	const containerModule = containerPath != null ? containerItem?.modules.get(containerPath.module) : undefined;
	const singleItemContainer = containerModule != null && containerModule instanceof ItemModuleLockSlot;

	const close = useCallback(() => {
		setFocus({
			container: item.container,
			itemId: null,
		});
	}, [item, setFocus]);

	useEffect(() => {
		if (!wornItem) {
			close();
		}
	}, [wornItem, close]);

	if (!wornItem) {
		return (
			<div className='inventoryView'>
				<div className='toolbar'>
					<span>Editing item: [ ERROR: ITEM NOT FOUND ]</span>
					<button onClick={ close }>✖️</button>
				</div>
			</div>
		);
	}

	return (
		<div className='inventoryView'>
			<div className='toolbar'>
				<span>Editing item: {wornItem.asset.definition.name}</span>
				{ !singleItemContainer && <button onClick={ close }>✖️</button> }
			</div>
			<Column overflowX='hidden' overflowY='auto'>
				<Row wrap>
					{
						singleItemContainer ? null : (
							<>
								<WardrobeActionButton action={ {
									type: 'move',
									target,
									item,
									shift: 1,
								} }>
									⬇️ Wear on top
								</WardrobeActionButton>
								<WardrobeActionButton action={ {
									type: 'move',
									target,
									item,
									shift: -1,
								} }>
									⬆️ Wear under
								</WardrobeActionButton>
							</>
						)
					}
					<WardrobeActionButton action={ {
						type: 'delete',
						target,
						item,
					} }>
						➖ Remove and delete
					</WardrobeActionButton>
				</Row>
				{
					(wornItem.asset.definition.colorization && wornItem.asset.definition.colorization.length > 0) && (
						<FieldsetToggle legend='Coloring'>
							{
								wornItem.asset.definition.colorization?.map((colorPart, colorPartIndex) => (
									<div className='wardrobeColorRow' key={ colorPartIndex }>
										<span className='flex-1'>{colorPart.name}</span>
										<ColorInput
											initialValue={ wornItem.color[colorPartIndex] ?? colorPart.default }
											resetValue={ colorPart.default }
											throttle={ 100 }
											disabled={ !canUseHands }
											onChange={ (color) => {
												if (shardConnector) {
													const newColor = wornItem.color.slice();
													newColor[colorPartIndex] = color;
													shardConnector.sendMessage('appearanceAction', {
														type: 'color',
														target,
														item,
														color: newColor,
													});
												}
											} }
										/>
									</div>
								))
							}
						</FieldsetToggle>
					)
				}
				{
					Array.from(wornItem.modules.entries())
						.map(([moduleName, m]) => (
							<FieldsetToggle legend={ `Module: ${m.config.name}` } key={ moduleName }>
								<WardrobeModuleConfig item={ item } moduleName={ moduleName } m={ m } setFocus={ setFocus } />
							</FieldsetToggle>
						))
				}
			</Column>
		</div>
	);
}

interface WardrobeModuleProps<Module extends IItemModule> {
	item: ItemPath;
	moduleName: string;
	m: Module;
	setFocus: (newFocus: WardrobeFocus) => void;
}

function WardrobeModuleConfig({ m, ...props }: WardrobeModuleProps<IItemModule>): ReactElement {
	if (m instanceof ItemModuleTyped) {
		return <WardrobeModuleConfigTyped { ...props } m={ m } />;
	}
	if (m instanceof ItemModuleStorage) {
		return <WardrobeModuleConfigStorage { ...props } m={ m } />;
	}
	if (m instanceof ItemModuleLockSlot) {
		return <WardrobeModuleConfigLockSlot { ...props } m={ m } />;
	}
	return <>[ ERROR: UNKNOWN MODULE TYPE ]</>;
}

function WardrobeModuleConfigTyped({ item, moduleName, m }: WardrobeModuleProps<ItemModuleTyped>): ReactElement {
	const { target } = useWardrobeContext();

	return (
		<Row wrap>
			{
				m.config.variants.map((v) => (
					<WardrobeActionButton action={ {
						type: 'moduleAction',
						target,
						item,
						module: moduleName,
						action: {
							moduleType: 'typed',
							setVariant: v.id,
						},
					} } key={ v.id } className={ m.activeVariant.id === v.id ? 'selected' : '' }>
						{ v.name }
					</WardrobeActionButton>
				))
			}
		</Row>
	);
}

function WardrobeModuleConfigStorage({ item, moduleName, m, setFocus }: WardrobeModuleProps<ItemModuleStorage>): ReactElement {
	return (
		<Row wrap>
			<button
				className={ classNames('wardrobeActionButton', 'allowed') }
				onClick={ (ev) => {
					ev.stopPropagation();
					setFocus({
						container: [
							...item.container,
							{
								item: item.itemId,
								module: moduleName,
							},
						],
						itemId: null,
					});
				} }
			>
				Open
			</button>
			<Row alignY='center'>
				Contains { m.getContents().length } items.
			</Row>
		</Row>
	);
}

function WardrobeModuleConfigLockSlot({ item, moduleName, m, setFocus }: WardrobeModuleProps<ItemModuleLockSlot>): ReactElement {
	return (
		<Row wrap>
			<button
				className={ classNames('wardrobeActionButton', 'allowed') }
				onClick={ (ev) => {
					ev.stopPropagation();
					setFocus({
						container: [
							...item.container,
							{
								item: item.itemId,
								module: moduleName,
							},
						],
						itemId: null,
					});
				} }
			>
				<img src={
					!m.lock ? emptyLock :
						m.lock.getProperties().blockAddRemove ? closedLock :
						openLock
				}
				width='21' height='33' />
			</button>
			<Row alignY='center'>
				{
					m.lock ?
					m.lock.getProperties().blockAddRemove ?
						m.lock.asset.definition.name + ': Locked' :
						m.lock.asset.definition.name + ': Not locked' :
					'No lock'
				}
			</Row>
		</Row>
	);
}

function WardrobeBodySizeEditor(): ReactElement {
	const { character } = useWardrobeContext();
	const shardConnector = useShardConnector();
	const bones = useCharacterAppearancePose(character);

	const setBodyDirect = useCallback(({ pose }: { pose: Record<BoneName, number>; }) => {
		if (shardConnector) {
			shardConnector.sendMessage('appearanceAction', {
				type: 'body',
				target: character.data.id,
				pose,
			});
		}
	}, [shardConnector, character]);

	const setBody = useMemo(() => _.throttle(setBodyDirect, 100), [setBodyDirect]);

	return (
		<div className='inventoryView'>
			<div className='bone-ui'>
				{
					bones
						.filter((bone) => bone.definition.type === 'body')
						.map((bone) => (
							<BoneRowElement key={ bone.definition.name } bone={ bone } onChange={ (value) => {
								setBody({
									pose: {
										[bone.definition.name]: value,
									},
								});
							} } />
						))
				}
			</div>
		</div>
	);
}

type AssetsPosePreset = AssetsPosePresets[number]['poses'][number];
type CheckedPosePreset = {
	active: boolean;
	available: boolean;
	name: string;
	pose: Partial<Record<BoneName, number>>;
	armsPose?: ArmsPose;
};
type CheckedAssetsPosePresets = {
	category: string;
	poses: CheckedPosePreset[];
}[];

function GetFilteredAssetsPosePresets(items: AppearanceItems, bonesStates: readonly BoneState[], arms: ArmsPose): {
	poses: CheckedAssetsPosePresets;
	forcePose?: Map<string, [number, number]>;
	forceArms?: ArmsPose;
} {
	const presets = GetAssetManager().getPosePresets();
	const limits = AppearanceItemsGetPoseLimits(items) || { forceArms: undefined, forcePose: undefined };
	const bones = new Map<BoneName, number>(bonesStates.map((bone) => [bone.definition.name, bone.rotation]));

	const isAvailable = ({ pose, armsPose }: AssetsPosePreset) => {
		if (armsPose !== undefined && limits.forceArms !== undefined && armsPose !== limits.forceArms)
			return false;

		if (!limits.forcePose)
			return true;

		for (const [boneName, value] of Object.entries(pose)) {
			if (value === undefined)
				continue;

			const limit = limits.forcePose.get(boneName);
			if (!limit)
				continue;

			if (value < limit[0] || value > limit[1])
				return false;
		}

		return true;
	};

	const isActive = (preset: AssetsPosePreset) => {
		if (preset.armsPose !== undefined && preset.armsPose !== arms)
			return false;

		for (const [boneName, value] of Object.entries(preset.pose)) {
			if (value === undefined)
				continue;

			if (bones.get(boneName) !== value)
				return false;
		}

		return true;
	};

	const poses = presets.map<CheckedAssetsPosePresets[number]>((preset) => ({
		category: preset.category,
		poses: preset.poses.map((pose) => {
			const available = isAvailable(pose);
			return {
				...pose,
				active: available && isActive(pose),
				available,
			};
		}),
	}));

	return { poses, ...limits };
}

function WardrobePoseCategoriesInternal({ poses, setPose }: { poses: CheckedAssetsPosePresets; setPose: (pose: AssetsPosePreset) => void; }): ReactElement {
	return (
		<>
			{poses.map((poseCategory, poseCategoryIndex) => (
				<React.Fragment key={ poseCategoryIndex }>
					<h4>{ poseCategory.category }</h4>
					<div className='pose-row'>
						{
							poseCategory.poses.map((pose, poseIndex) => (
								<PoseButton key={ poseIndex } pose={ pose } setPose={ setPose } />
							))
						}
					</div>
				</React.Fragment>
			))}
		</>
	);
}

export function WardrobePoseCategories({ appearance, bones, armsPose, setPose }: { appearance: CharacterAppearance; bones: readonly BoneState[]; armsPose: ArmsPose; setPose: (_: { pose: Partial<Record<BoneName, number>>; armsPose?: ArmsPose }) => void }): ReactElement {
	const { poses } = useMemo(() => GetFilteredAssetsPosePresets(appearance.getAllItems(), bones, armsPose), [appearance, bones, armsPose]);
	return (
		<WardrobePoseCategoriesInternal poses={ poses } setPose={ setPose } />
	);
}

export function WardrobePoseGui({ character }: { character: Character }): ReactElement {
	const shardConnector = useShardConnector();

	const bones = useCharacterAppearancePose(character);
	const armsPose = useCharacterAppearanceArmsPose(character);
	const view = useCharacterAppearanceView(character);

	const setPoseDirect = useEvent(({ pose, armsPose: armsPoseSet }: { pose: Partial<Record<BoneName, number>>; armsPose?: ArmsPose }) => {
		if (shardConnector) {
			shardConnector.sendMessage('appearanceAction', {
				type: 'pose',
				target: character.data.id,
				pose,
				armsPose: armsPoseSet,
			});
		}
	});

	const { poses, forceArms, forcePose } = useMemo(() => GetFilteredAssetsPosePresets(character.appearance.getAllItems(), bones, armsPose), [character, bones, armsPose]);

	const setPose = useMemo(() => _.throttle(setPoseDirect, 100), [setPoseDirect]);

	return (
		<div className='inventoryView'>
			<div className='bone-ui'>
				<div>
					<label htmlFor='back-view-toggle'>Show back view</label>
					<input
						id='back-view-toggle'
						type='checkbox'
						checked={ view === CharacterView.BACK }
						onChange={ (e) => {
							if (shardConnector) {
								shardConnector.sendMessage('appearanceAction', {
									type: 'setView',
									target: character.data.id,
									view: e.target.checked ? CharacterView.BACK : CharacterView.FRONT,
								});
							}
						} }
					/>
				</div>
				<WardrobePoseCategoriesInternal poses={ poses } setPose={ setPose } />
				{ USER_DEBUG &&
					<FieldsetToggle legend='[DEV] Manual pose' persistent='bone-ui-dev-pose' open={ false }>
						<div>
							<label htmlFor='arms-front-toggle'>Arms are in front of the body</label>
							<input
								id='arms-front-toggle'
								type='checkbox'
								checked={ armsPose === ArmsPose.FRONT }
								disabled={ forceArms !== undefined }
								onChange={ (e) => {
									if (shardConnector) {
										setPose({
											pose: {},
											armsPose: e.target.checked ? ArmsPose.FRONT : ArmsPose.BACK,
										});
									}
								} }
							/>
						</div>
						<br />
						{
							bones
								.filter((bone) => bone.definition.type === 'pose')
								.map((bone) => (
									<BoneRowElement key={ bone.definition.name } bone={ bone } forcePose={ forcePose } onChange={ (value) => {
										setPose({
											pose: {
												[bone.definition.name]: value,
											},
										});
									} } />
								))
						}
					</FieldsetToggle>}
			</div>
		</div>
	);
}

function PoseButton({ pose, setPose }: { pose: CheckedPosePreset; setPose: (pose: AssetsPosePreset) => void; }): ReactElement {
	const { name, available, active } = pose;
	return (
		<Button className={ classNames('slim', { ['pose-unavailable']: !available }) } disabled={ active || !available } onClick={ () => setPose(pose) }>
			{ name }
		</Button>
	);
}

export function GetVisibleBoneName(name: string): string {
	return name
		.replace(/^\w/, (c) => c.toUpperCase())
		.replace(/_r$/, () => ' Right')
		.replace(/_l$/, () => ' Left')
		.replace(/_\w/g, (c) => ' ' + c.charAt(1).toUpperCase());
}

export function BoneRowElement({ bone, onChange, forcePose, unlocked }: { bone: BoneState; onChange: (value: number) => void; forcePose?: Map<string, [number, number]>; unlocked?: boolean; }): ReactElement {
	const [min, max] = useMemo(() => {
		if (unlocked || !forcePose) {
			return [BONE_MIN, BONE_MAX];
		}
		return forcePose.get(bone.definition.name) ?? [BONE_MIN, BONE_MAX];
	}, [bone, forcePose, unlocked]);

	const name = useMemo(() => GetVisibleBoneName(bone.definition.name), [bone]);

	const onInput = useEvent((event: React.ChangeEvent<HTMLInputElement>) => {
		const value = Math.round(parseFloat(event.target.value));
		if (Number.isInteger(value) && value >= min && value <= max && value !== bone.rotation) {
			onChange(value);
		}
	});

	return (
		<FieldsetToggle legend={ name } persistent={ 'bone-ui-' + bone.definition.name }>
			<div className='bone-rotation'>
				<input type='range' min={ min } max={ max } step='1' value={ bone.rotation } onChange={ onInput } />
				<input type='number' min={ min } max={ max } step='1' value={ bone.rotation } onChange={ onInput } />
				<Button className='slim' onClick={ () => onChange(0) } disabled={ bone.rotation === 0 || min > 0 || max < 0 }>
					↺
				</Button>
			</div>
		</FieldsetToggle>
	);
}

export function WardrobeExpressionGui(): ReactElement {
	const { character } = useWardrobeContext();
	const appearance = useCharacterAppearanceItems(character);

	const setFocus = useCallback(() => {
		Assert(false, 'Expressions cannot focus container!');
	}, []);

	return (
		<div className='inventoryView'>
			<Column overflowX='hidden' overflowY='auto'>
				{
					appearance
						.flatMap((item) => (
							Array.from(item.modules.entries())
								.filter((m) => m[1].config.expression)
								.map(([moduleName, m]) => (
									<FieldsetToggle legend={ m.config.expression } key={ moduleName }>
										<WardrobeModuleConfig
											item={ { container: [], itemId: item.id } }
											moduleName={ moduleName }
											m={ m }
											setFocus={ setFocus }
										/>
									</FieldsetToggle>
								))
						))
				}
			</Column>
		</div>
	);
}
