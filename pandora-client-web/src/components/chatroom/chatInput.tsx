import { AssertNotNullable, CharacterId, IChatRoomStatus, IChatType, RoomId } from 'pandora-common';
import React, { createContext, ForwardedRef, forwardRef, ReactElement, ReactNode, RefObject, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { noop } from 'lodash';
import { Character } from '../../character/character';
import { useChatRoomCharacters, useChatRoomData, useChatRoomMessageSender, useChatroomRequired, useChatRoomSetPlayerStatus, useChatRoomStatus } from '../gameContext/chatRoomContextProvider';
import { useEvent } from '../../common/useEvent';
import { AutocompleteDisplyData, CommandAutocomplete, CommandAutocompleteCycle, COMMAND_KEY, RunCommand } from './commandsProcessor';
import { toast } from 'react-toastify';
import { TOAST_OPTIONS_ERROR } from '../../persistentToast';
import { Button } from '../common/Button/Button';
import { usePlayerId } from '../gameContext/playerContextProvider';
import './chatroom.scss';
import { BrowserStorage } from '../../browserStorage';
import { useShardConnector } from '../gameContext/shardConnectorContextProvider';
import classNames from 'classnames';
import { Row } from '../common/container/container';
import { GetChatModeDescription } from './commands';

export type IChatInputHandler = {
	focus: () => void;
	setValue: (value: string) => void;
	target: Character | null;
	setTarget: (target: CharacterId | null) => void;
	editing: number | null;
	setEditing: (editing: number | null) => boolean;
	autocompleteHint: AutocompleteDisplyData | null;
	setAutocompleteHint: (hint: AutocompleteDisplyData | null) => void;
	mode: ChatMode | null;
	setMode: (mode: ChatMode | null) => void;
	ref: RefObject<HTMLTextAreaElement>;
};

const chatInputContext = createContext<IChatInputHandler>({
	focus: noop,
	setValue: noop,
	target: null,
	setTarget: noop,
	editing: null,
	setEditing: () => false,
	autocompleteHint: null,
	setAutocompleteHint: noop,
	mode: null,
	setMode: noop,
	ref: null as unknown as RefObject<HTMLTextAreaElement>,
});

type ChatInputSave = {
	input: string;
	roomId: RoomId | null;
};
const InputResore = BrowserStorage.createSession<ChatInputSave>('saveChatInput', { input: '', roomId: null });

export type ChatMode = {
	type: IChatType,
	raw: boolean,
};

export function ChatInputContextProvider({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [target, setTarget] = useState<Character | null>(null);
	const [editing, setEditingState] = useState<number | null>(null);
	const [autocompleteHint, setAutocompleteHint] = useState<AutocompleteDisplyData | null>(null);
	const [mode, setMode] = useState<ChatMode | null>(null);
	const characters = useChatRoomCharacters();
	const sender = useChatRoomMessageSender();
	const playerId = usePlayerId();
	const roomId = useChatRoomData()?.id;

	useEffect(() => {
		if (!roomId)
			return;

		if (roomId !== InputResore.value.roomId) {
			InputResore.value = { input: '', roomId };
		}
	}, [roomId]);

	const setEditing = useEvent((messageId: number | null) => {
		setEditingState(messageId);
		if (!messageId) {
			ref.current?.focus();
			return true;
		}
		const { text, target: targetId } = sender.getMessageEdit(messageId) ?? {};
		if (!text) {
			return false;
		}
		if (targetId) {
			const targetCharacter = characters?.find((c) => c.data.id === targetId);
			if (targetCharacter) {
				setTarget(targetCharacter);
			} else {
				toast(`Character ${targetId} not found`, TOAST_OPTIONS_ERROR);
			}
		}
		if (ref.current) {
			ref.current.value = text;
			ref.current.focus();
		}
		return true;
	});

	// Handler to autofocus chat input
	useEffect(() => {
		const keyPressHandler = (ev: KeyboardEvent) => {
			if (
				ref.current &&
				// Only if no other input is selected
				(!document.activeElement || !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) &&
				// Only if this isn't a special key or key combo
				!ev.ctrlKey &&
				!ev.metaKey &&
				!ev.altKey &&
				ev.key.length === 1
			) {
				ref.current.focus();
			}
		};
		window.addEventListener('keypress', keyPressHandler);
		return () => {
			window.removeEventListener('keypress', keyPressHandler);
		};
	}, []);

	const context = useMemo(() => ({
		focus: () => ref.current?.focus(),
		setValue: (value: string) => {
			if (ref.current) {
				ref.current.value = value;
			}
			InputResore.value = { input: value, roomId: InputResore.value.roomId };
		},
		target,
		setTarget: (t: CharacterId | null) => {
			if (t === playerId) {
				return;
			}
			setTarget(!t ? null : characters?.find((c) => c.data.id === t) ?? null);
		},
		editing,
		setEditing,
		autocompleteHint,
		setAutocompleteHint,
		mode,
		setMode,
		ref,
	}), [target, editing, setEditing, autocompleteHint, setAutocompleteHint, playerId, characters, mode]);

	return (
		<chatInputContext.Provider value={ context }>
			{ children }
		</chatInputContext.Provider>
	);
}

export function ChatInputArea({ messagesDiv, scroll, newMessageCount }: { messagesDiv: RefObject<HTMLDivElement>; scroll: (forceScroll: boolean) => void, newMessageCount: number }) {
	const { ref } = useChatInput();
	return (
		<>
			<AutoCompleteHint />
			<UnreadMessagesIndicator newMessageCount={ newMessageCount } scroll={ scroll } />
			<TypingIndicator />
			<Modifiers scroll={ scroll } />
			<TextArea ref={ ref } messagesDiv={ messagesDiv } />
		</>
	);
}

function TextAreaImpl({ messagesDiv }: { messagesDiv: RefObject<HTMLDivElement> }, ref: ForwardedRef<HTMLTextAreaElement>) {
	const lastInput = useRef('');
	const timeout = useRef<number>();
	const setPlayerStatus = useChatRoomSetPlayerStatus();
	const chatRoom = useChatroomRequired();
	const sender = useChatRoomMessageSender();
	const chatInput = useChatInput();
	const { target, editing, setEditing, setValue, setAutocompleteHint, mode } = chatInput;

	const shardConnector = useShardConnector();
	AssertNotNullable(shardConnector);

	const inputEnd = useEvent(() => {
		if (timeout.current) {
			clearTimeout(timeout.current);
			timeout.current = 0;
		}
		setPlayerStatus('none');
	});

	const updateCommandHelp = useEvent((textarea: HTMLTextAreaElement) => {
		let input = textarea.value;
		if (
			input.startsWith(COMMAND_KEY) &&
			!input.startsWith(COMMAND_KEY + COMMAND_KEY) &&
			editing == null
		) {
			input = input.slice(1, textarea.selectionStart || textarea.value.length);

			const autocompleteResult = CommandAutocomplete(input, {
				shardConnector,
				chatRoom,
				messageSender: sender,
				inputHandlerContext: chatInput,
			});

			setAutocompleteHint({
				replace: textarea.value,
				result: autocompleteResult,
				index: null,
			});
		} else {
			setAutocompleteHint(null);
		}
	});

	const onKeyDown = useEvent((ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
		const textarea = ev.currentTarget;
		if (ev.key === 'Enter' && !ev.shiftKey) {
			ev.preventDefault();
			ev.stopPropagation();
			try {
				setAutocompleteHint(null);
				let input = textarea.value;
				if (
					input.startsWith(COMMAND_KEY) &&
					!input.startsWith(COMMAND_KEY + COMMAND_KEY) &&
					editing == null
				) {
					// Process command
					if (RunCommand(input.slice(1), {
						displayError(error) {
							toast(error, TOAST_OPTIONS_ERROR);
						},
						shardConnector,
						chatRoom,
						messageSender: sender,
						inputHandlerContext: chatInput,
					})) {
						textarea.value = '';
					}
				} else {
					// Double command key escapes itself
					if (input.startsWith(COMMAND_KEY + COMMAND_KEY)) {
						input = input.slice(1);
					}
					input = input.trim();
					// Ignore empty input, unless editing
					if (editing == null && !input) {
						return;
					}
					// TODO ... all options
					sender.sendMessage(input, {
						target: target?.data.id,
						editing: editing || undefined,
						type: mode?.type || undefined,
						raw: mode?.raw || undefined,
					});
					textarea.value = '';
					setEditing(null);
				}
			} catch (error) {
				if (error instanceof Error) {
					toast(error.message, TOAST_OPTIONS_ERROR);
				}
				return;
			}
		}
		if (ev.key === 'Tab' && textarea.value.startsWith(COMMAND_KEY) && !textarea.value.startsWith(COMMAND_KEY + COMMAND_KEY)) {
			ev.preventDefault();
			ev.stopPropagation();
			try {
				// Process command
				const inputPosition = textarea.selectionStart || textarea.value.length;
				const input = textarea.value.slice(1, textarea.selectionStart);

				const autocompleteResult = CommandAutocompleteCycle(input, {
					displayError(error) {
						toast(error, TOAST_OPTIONS_ERROR);
					},
					shardConnector,
					chatRoom,
					messageSender: sender,
					inputHandlerContext: chatInput,
				});

				const replacementStart = COMMAND_KEY + autocompleteResult.replace;

				textarea.value = replacementStart + textarea.value.slice(inputPosition).trimStart();
				textarea.setSelectionRange(replacementStart.length, replacementStart.length, 'none');
				setAutocompleteHint(autocompleteResult);

			} catch (error) {
				if (error instanceof Error) {
					toast(error.message, TOAST_OPTIONS_ERROR);
				}
			}
			return;
		}
		if (ev.key === 'ArrowUp' && !textarea.value.trim()) {
			ev.preventDefault();
			ev.stopPropagation();
			const edit =  sender.getLastMessageEdit();
			if (edit) {
				setEditing(edit);
				return;
			}
		}
		if ((ev.key === 'PageUp' || ev.key === 'PageDown') && !ev.shiftKey) {
			messagesDiv.current?.focus();
			return;
		}
		if (ev.key === 'Escape' && editing) {
			ev.preventDefault();
			ev.stopPropagation();
			setEditing(null);
			setValue('');
			return;
		}

		const value = textarea.value;
		if (value === lastInput.current)
			return;

		lastInput.current = value;
		InputResore.value = { input: value, roomId: InputResore.value.roomId };
		let nextStatus: null | { status: IChatRoomStatus, target?: CharacterId } = null;
		const trimmed = value.trim();
		if (trimmed.length > 0 && (!value.startsWith(COMMAND_KEY) || value.startsWith(COMMAND_KEY + COMMAND_KEY))) {
			nextStatus = { status: target ? 'whispering' : 'typing', target: target?.data.id };
		} else {
			nextStatus = { status: 'none' };
		}

		if (nextStatus.status === 'none') {
			inputEnd();
			return;
		}

		setPlayerStatus(nextStatus.status, nextStatus.target);

		if (timeout.current) {
			clearTimeout(timeout.current);
			timeout.current = 0;
		}
		timeout.current = setTimeout(() => inputEnd(), 3_000);
	});

	const onChange = useEvent((ev: React.ChangeEvent<HTMLTextAreaElement>) => {
		updateCommandHelp(ev.target);
	});

	useEffect(() => () => inputEnd(), [inputEnd]);

	return <textarea ref={ ref } onKeyDown={ onKeyDown } onChange={ onChange } onBlur={ inputEnd } defaultValue={ InputResore.value.input } />;
}

const TextArea = forwardRef(TextAreaImpl);

export function useChatInput(): IChatInputHandler {
	return useContext(chatInputContext);
}

function TypingIndicator(): ReactElement {
	let statuses = useChatRoomStatus();
	const playerId = usePlayerId();

	statuses = statuses.filter((s) => s.data.id !== playerId && (s.status === 'typing' || s.status === 'whispering'));

	const extra: ReactNode[] = [];
	if (statuses.filter((s) => s.status === 'typing').length > 3) {
		statuses = statuses.filter((s) => s.status !== 'typing');
		extra.push(<span key='extra-multiple-typing'>Multiple people are typing</span>);
	}

	return (
		<div className='typing-indicator'>
			{ statuses.map(({ data, status }) => (
				<span key={ data.id }>
					<span style={ { color: data.settings.labelColor } }>{ data.name } </span>
					({ data.id })
					{ ' is ' }
					{ status }
				</span>
			)) }
			{ extra }
		</div>
	);
}

function UnreadMessagesIndicator({ newMessageCount, scroll }: { newMessageCount: number, scroll: (forceScroll: boolean) => void }): ReactElement | null {
	if (newMessageCount === 0) {
		return null;
	}

	const indicatorText = `Unread chat message${newMessageCount > 1 ? `s (${newMessageCount})` : ''}`;

	return (
		<button className='unread-messages-indicator' onClick={ () => scroll(true) }>
			<Row className='flex-1' alignX='space-between'>
				<span>{ indicatorText }</span>
				<span>Click to scroll to the end</span>
			</Row>
		</button>
	);
}

function Modifiers({ scroll }: { scroll: (forceScroll: boolean) => void }): ReactElement {
	const { target, setTarget, editing, setEditing, setValue, mode, setMode } = useChatInput();
	const lastHasTarget = useRef(target !== null);
	const lastEditing = useRef(editing);

	useEffect(() => {
		if (lastHasTarget.current !== (target !== null) || lastEditing.current !== editing) {
			scroll(false);
			lastHasTarget.current = target !== null;
			lastEditing.current = editing;
		}
	}, [target, editing, scroll]);

	return (
		<div className='input-modifiers'>
			{ target && (
				<span>
					{ 'Whispering to ' }
					<span style={ { color: target.data.settings.labelColor } }>{ target.data.name }</span>
					{ ' ' }
					({ target.data.id })
					{ ' ' }
					<Button className='slim' onClick={ () => setTarget(null) }>Cancel</Button>
				</span>
			) }
			{ editing && (
				<span>
					{ 'Editing message ' }
					<Button className='slim' onClick={ () => {
						setEditing(null);
						setValue('');
					} }>
						Cancel
					</Button>
				</span>
			) }
			{ mode && !(mode.type === 'chat' && !mode.raw) && (
				<span>
					{ 'Sending ' }
					{ GetChatModeDescription(mode, true) }
					{ ' ' }
					<Button className='slim' onClick={ () => setMode(null) }>Cancel</Button>
				</span>
			) }
		</div>
	);
}

function AutoCompleteHint(): ReactElement | null {
	const { autocompleteHint, ref } = useChatInput();

	const chatRoom = useChatroomRequired();
	const sender = useChatRoomMessageSender();
	const chatInput = useChatInput();
	const { setAutocompleteHint } = chatInput;

	const shardConnector = useShardConnector();
	AssertNotNullable(shardConnector);
	if (!autocompleteHint?.result)
		return null;

	// When only one command can/should be displayed, onlyShowOption is set to that command's index in the option array
	let onlyShowOption = -1;
	if (autocompleteHint.result.options.length === 1) {
		onlyShowOption = 0;
	} else if (ref.current) {
		onlyShowOption = autocompleteHint.result.options.findIndex((option) => COMMAND_KEY + option.replaceValue === ref.current?.value);
	}
	if (onlyShowOption !== -1 && !autocompleteHint.result.options[onlyShowOption]?.longDescription) {
		onlyShowOption = -1;
	}

	return (
		<div className='autocomplete-hint'>
			<div>
				{ autocompleteHint.result.header }
				{
					autocompleteHint.result.options.length > 0 &&
						<>
							<hr />
							{
								autocompleteHint.result.options.map((option, index) => (
									(onlyShowOption === -1 || onlyShowOption === index) &&
									<span key={ index }
										className={ classNames({ selected: index === autocompleteHint.index }) }
										onClick={ (ev) => {
											const textarea = ref.current;
											if (!textarea)
												return;

											ev.preventDefault();
											ev.stopPropagation();

											const inputPosition = textarea.selectionStart || textarea.value.length;
											const input = option.replaceValue + ' ';

											textarea.value = COMMAND_KEY + input + textarea.value.slice(inputPosition).trimStart();
											textarea.focus();
											textarea.setSelectionRange(input.length + 1, input.length + 1, 'none');

											const autocompleteResult = CommandAutocomplete(input, {
												shardConnector,
												chatRoom,
												messageSender: sender,
												inputHandlerContext: chatInput,
											});

											setAutocompleteHint({
												replace: textarea.value,
												result: autocompleteResult,
												index: null,
											});
										} }
									>
										{option.displayValue}
									</span>
								))
							}
						</>
				}
				{
					onlyShowOption >= 0 &&
						<>
							<hr />
							{ autocompleteHint.result.options[onlyShowOption]?.longDescription }
						</>
				}
			</div>
		</div>
	);
}
