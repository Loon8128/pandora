import { createHtmlPortalNode, HtmlPortalNode, InPortal, OutPortal } from 'react-reverse-portal';
import React, { ReactElement, ReactNode, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { Rnd } from 'react-rnd';
import { sortBy } from 'lodash';
import { ChildrenProps } from '../../common/reactTypes';
import { Button, ButtonProps } from '../common/button/button';
import { Observable, useObservable } from '../../observable';
import './dialog.scss';
import { useAsyncEvent, useEvent } from '../../common/useEvent';
import { Column, Row } from '../common/container/container';
import classNames from 'classnames';
import { useKeyDownEvent } from '../../common/useKeyDownEvent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HtmlPortalNodeAny = HtmlPortalNode<any>;

const DEFAULT_CONFIRM_DIALOG_SYMBOL = Symbol('DEFAULT_CONFIRM_DIALOG_SYMBOL');
const DEFAULT_CONFIRM_DIALOG_PRIORITY = 10;

export type DialogLocation = 'global' | 'mainOverlay';

const PORTALS = new Observable<readonly ({
	priority: number;
	location: DialogLocation;
	node: HtmlPortalNodeAny;
})[]>([]);

export function Dialogs({ location }: {
	location: DialogLocation;
}): ReactElement {
	const portals = useObservable(PORTALS);

	return (
		<>
			{
				portals
					.filter((portal) => portal.location === location)
					.map(({ node }, index) => (
						<OutPortal key={ index } node={ node } />
					))
			}
			{
				location === 'global' ? (
					<ConfirmDialog symbol={ DEFAULT_CONFIRM_DIALOG_SYMBOL } />
				) : null
			}
		</>
	);
}

export function DialogInPortal({ children, priority, location = 'global' }: {
	children?: ReactNode;
	priority?: number;
	location?: DialogLocation;
}): ReactElement {
	const portal = useMemo(() => createHtmlPortalNode({
		attributes: {
			class: 'dialog-portal',
		},
	}), []);

	useLayoutEffect(() => {
		PORTALS.produce((existingPortals) => {
			return sortBy([
				{
					priority: priority ?? 0,
					location,
					node: portal,
				},
				...existingPortals,
			], (v) => v.priority);
		});

		return () => {
			PORTALS.value = PORTALS.value.filter(({ node }) => node !== portal);
		};
	}, [portal, priority, location]);

	return (
		<InPortal node={ portal }>
			{ children }
		</InPortal>
	);
}

export function ModalDialog({ children, priority, position = 'center' }: ChildrenProps & {
	/**
	 * Priority of this dialog for ordering the dialogs on screen.
	 * Higher priority dialogs cover lower priority dialogs.
	 * @default 0
	 */
	priority?: number;
	position?: 'center' | 'top';
}): ReactElement {
	return (
		<DialogInPortal priority={ priority }>
			<div className={ classNames('dialog', position) }>
				<div className='dialog-content'>
					{ children }
				</div>
			</div>
		</DialogInPortal>
	);
}

export function DraggableDialog({ children, title, rawContent, close }: {
	children?: ReactNode;
	title: string;
	rawContent?: boolean;
	close?: () => void;
}): ReactElement {
	return (
		<DialogInPortal priority={ -1 } >
			<div className='overlay-bounding-box'>
				<Rnd
					className='dialog-draggable'
					dragHandleClassName='drag-handle'
					default={ {
						x: Math.max((window.innerWidth ?? 0) / 4 - 20, 0),
						y: Math.max((window.innerHeight ?? 0) / 8 - 10, 0),
						width: 'auto',
						height: 'auto',
					} }
					bounds='parent'
				>
					<header className='drag-handle'>
						{ title }
						{ close ? (
							<span className='dialog-close' onClick={ close }>
								×
							</span>
						) : null }
					</header>
					{
						rawContent ? children : (
							<div className='dialog-content'>
								{ children }
							</div>
						)
					}
				</Rnd>
			</div>
		</DialogInPortal>
	);
}

type ConfirmDialogEntry = Readonly<{
	title: string;
	content: ReactNode;
	priority?: number;
	handler: (result: boolean) => void;
}>;

const CONFIRM_DIALOGS = new Map<symbol, Observable<ConfirmDialogEntry | null>>();

function GetConfirmDialogEntry(symbol: symbol) {
	let entry = CONFIRM_DIALOGS.get(symbol);
	if (!entry) {
		CONFIRM_DIALOGS.set(symbol, entry = new Observable<ConfirmDialogEntry | null>(null));
	}
	return entry;
}

function useConfirmDialogController(symbol: symbol): {
	open: boolean;
	title: string;
	content: ReactNode;
	priority: number;
	onConfirm: () => void;
	onCancel: () => void;
} {
	const observed = useObservable(GetConfirmDialogEntry(symbol));
	const onConfirm = useEvent(() => {
		if (observed == null)
			return;

		observed.handler(true);
	});
	const onCancel = useEvent(() => {
		if (observed == null)
			return;

		observed.handler(false);
	});
	const open = observed != null;
	const title = observed != null ? observed.title : '';
	const content = observed?.content;
	const priority = observed?.priority ?? DEFAULT_CONFIRM_DIALOG_PRIORITY;
	return {
		open,
		title,
		content,
		priority,
		onConfirm,
		onCancel,
	};
}

type ConfirmDialogProps = {
	symbol: symbol;
	yes?: ReactNode;
	no?: ReactNode;
};

export function ConfirmDialog({ symbol, yes = 'Ok', no = 'Cancel' }: ConfirmDialogProps) {
	const { open, title, content, priority, onConfirm, onCancel } = useConfirmDialogController(symbol);

	if (!open)
		return null;

	return (
		<ModalDialog priority={ priority }>
			<Column className='dialog-confirm'>
				<strong>{ title }<hr /></strong>
				<Column padding='large'>
					{ content }
				</Column>
				<Row gap='small' alignX='space-between'>
					<Button onClick={ onCancel }>
						{ no }
					</Button>
					<Button onClick={ onConfirm }>
						{ yes }
					</Button>
				</Row>
			</Column>
		</ModalDialog>
	);
}

export function useConfirmDialog(symbol: symbol = DEFAULT_CONFIRM_DIALOG_SYMBOL): (title: string, content?: ReactNode, priority?: number) => Promise<boolean> {
	const unset = useRef(false);
	const entry = GetConfirmDialogEntry(symbol);
	const resolveRef = useRef<(result: boolean) => void>();
	useEffect(() => () => {
		if (unset.current) {
			entry.value = null;
		}
	}, [entry]);
	useKeyDownEvent(useCallback(() => {
		if (resolveRef.current) {
			unset.current = false;
			entry.value = null;
			resolveRef.current(false);
			resolveRef.current = undefined;
			return true;
		}
		return false;
	}, [entry]), 'Escape');
	return useCallback((title: string, content?: ReactNode, priority?: number) => new Promise<boolean>((resolve) => {
		unset.current = true;
		resolveRef.current = resolve;
		entry.value = {
			title,
			content,
			priority,
			handler: (result) => {
				unset.current = false;
				entry.value = null;
				resolve(result);
				resolveRef.current = undefined;
			},
		};
	}), [entry]);
}

function ButtonConfirmImpl({ title, content, priority, onClick, disabled, children, ...props }: ButtonProps & { title: string; content?: ReactNode; priority?: number; }, ref: React.ForwardedRef<HTMLButtonElement>) {
	const confirm = useConfirmDialog();

	const [onActualClick, processing] = useAsyncEvent(async (ev: React.MouseEvent<HTMLButtonElement>) => {
		ev.preventDefault();
		ev.stopPropagation();
		return [await confirm(title, content, priority), ev] as const;
	}, ([result, ev]: readonly [boolean, React.MouseEvent<HTMLButtonElement>]) => {
		if (result) {
			onClick?.(ev);
		}
	});

	return (
		<Button { ...props } ref={ ref } onClick={ onActualClick } disabled={ disabled || processing }>
			{ children }
		</Button>
	);
}

export const ButtonConfirm = React.forwardRef(ButtonConfirmImpl);
