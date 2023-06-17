import classNames from 'classnames';
import { IsAuthorized } from 'pandora-common';
import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import friendsIcon from '../../assets/icons/friends.svg';
import notificationsIcon from '../../assets/icons/notification.svg';
import settingsIcon from '../../assets/icons/setting.svg';
import wikiIcon from '../../assets/icons/wiki.svg';
import managementIcon from '../../assets/icons/management.svg';
import { usePlayerData, usePlayerState } from '../gameContext/playerContextProvider';
import { useCurrentAccount, useDirectoryConnector } from '../gameContext/directoryConnectorContextProvider';
import { useShardConnectionInfo } from '../gameContext/shardConnectorContextProvider';
import './header.scss';
import { HeaderButton } from './HeaderButton';
import { NotificationHeaderKeys, NotificationSource, useNotification, useNotificationHeader } from '../gameContext/notificationContextProvider';
import { toast } from 'react-toastify';
import { TOAST_OPTIONS_ERROR } from '../../persistentToast';
import { DirectMessageChannel } from '../../networking/directMessageManager';
import { useCharacterSafemode } from '../../character/character';
import { useSafemodeDialogContext } from '../characterSafemode/characterSafemode';
import { RelationshipContext, useRelationships } from '../releationships/relationships';
import { useObservable } from '../../observable';
import { LeaveButton } from './leaveButton';

function LeftHeader(): ReactElement {
	const connectionInfo = useShardConnectionInfo();

	const characterData = usePlayerData();
	const characterName = (characterData && !characterData.inCreation) ? characterData.name : null;

	const [showCharacterMenu, setShowCharacterMenu] = useState<boolean>(false);

	return (
		<div className='leftHeader flex'>
			{ /*
			<div className="headerButton"><img className='avatar' src='/iconClare.png' />Clare</div>
			<div className="headerButton">Inventory</div>
			<div className="headerButton">Room</div>
			*/ }
			{ connectionInfo && (
				<button className={ classNames('HeaderButton', 'withText', showCharacterMenu && 'active') } onClick={ (ev) => {
					ev.currentTarget.focus();
					setShowCharacterMenu(!showCharacterMenu);
				} }>
					{ characterName ?? `[Character ${connectionInfo.characterId}]` }
				</button>
			) }
			{ !connectionInfo && <span>[no character selected]</span> }
			{ connectionInfo && showCharacterMenu && <CharacterMenu close={ () => setShowCharacterMenu(false) } /> }
		</div>
	);
}

function CharacterMenu({ close }: { close: () => void; }): ReactElement {
	const playerState = usePlayerState();

	const safemode = useCharacterSafemode(playerState);
	const safemodeContext = useSafemodeDialogContext();

	return (
		<div className='characterMenu' onClick={ () => close() }>
			<header onClick={ (ev) => ev.stopPropagation() }>Character menu</header>
			<a onClick={ (ev) => {
				ev.preventDefault();
				safemodeContext.show();
			} }>
				{ safemode ? 'Exit' : 'Enter' } safemode
			</a>
		</div>
	);
}

function RightHeader(): ReactElement {
	const currentAccount = useCurrentAccount();
	const navigate = useNavigate();
	const loggedIn = currentAccount != null;

	const isDeveloper = currentAccount?.roles !== undefined && IsAuthorized(currentAccount.roles, 'developer');

	return (
		<div className='rightHeader'>
			{ loggedIn && (
				<>
					<HeaderButton icon={ wikiIcon } iconAlt='Wiki' onClick={ () => navigate('/wiki') } title='Wiki' />
					<NotificationButton icon={ notificationsIcon } title='Notifications' type='notifications' onClick={ () => toast('Not implemented yet, notifications cleared', TOAST_OPTIONS_ERROR) } />
					<FriendsHeaderButton />
					<HeaderButton icon={ settingsIcon } iconAlt='Settings' onClick={ () => navigate('/settings') } title='Settings' />
					{ isDeveloper && <HeaderButton icon={ managementIcon } iconAlt='Settings' onClick={ () => navigate('/management') } title='Management' /> }
					<span>{ currentAccount.username }</span>
					<LeaveButton />
				</>
			) }
			{ !loggedIn && <span>[not logged in]</span> }
		</div>
	);
}

function NotificationButton({ icon, title, type, onClick }: {
	icon: string;
	title: string;
	type: NotificationHeaderKeys;
	onClick: (_: React.MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
	const [notification, clearNotifications] = useNotificationHeader(type);

	const onNotificationClick = useCallback((ev: React.MouseEvent<HTMLButtonElement>) => {
		clearNotifications();
		onClick(ev);
	}, [clearNotifications, onClick]);

	return (
		<HeaderButton
			icon={ icon }
			iconAlt={ `${ notification.length } ${ title }` }
			title={ title }
			badge={ notification.length }
			onClick={ onNotificationClick } />
	);
}

function FriendsHeaderButton(): ReactElement {
	const navigate = useNavigate();
	const handler = useDirectoryConnector().directMessageHandler;
	const notifyDirectMessage = useNotification(NotificationSource.DIRECT_MESSAGE);
	const unreadDirectMessageCount = useObservable(handler.info).filter((info) => info.hasUnread).length;
	const incomingFriendRequestCount = useRelationships('incoming').length;
	const notificationCount = unreadDirectMessageCount + incomingFriendRequestCount;

	useEffect(() => handler.on('newMessage', (channel: DirectMessageChannel) => {
		if (channel.mounted && document.visibilityState === 'visible')
			return;

		notifyDirectMessage({
			// TODO: notification
		});
	}), [handler, notifyDirectMessage]);

	const notifyFriendRequest = useNotification(NotificationSource.INCOMING_FRIEND_REQUEST);
	useEffect(() => RelationshipContext.on('incoming', () => notifyFriendRequest({
		// TODO: ...
	})), [notifyFriendRequest]);

	return (
		<HeaderButton
			icon={ friendsIcon }
			iconAlt={ `${ notificationCount } Friends` }
			title='Friends'
			badge={ notificationCount }
			onClick={ () => navigate('/relationships') } />
	);
}

export function Header(): ReactElement {
	return (
		<header className='Header'>
			<LeftHeader />
			<RightHeader />
		</header>
	);
}
