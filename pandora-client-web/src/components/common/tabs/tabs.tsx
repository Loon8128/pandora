import classNames from 'classnames';
import React, { ReactElement, useMemo, useState, ReactNode } from 'react';
import { ChildrenProps } from '../../../common/reactTypes';
import './tabs.scss';

interface TabProps extends ChildrenProps {
	name: ReactNode;
	default?: boolean;
	onClick?: React.MouseEventHandler;
	className?: string;
}

export function TabContainer({ children, id, className, collapsable }: {
	children: (ReactElement<TabProps> | undefined | null)[]
	id?: string;
	className?: string;
	collapsable?: true;
}): ReactElement {

	const [currentTab, setTab] = useState(() => {
		const defaultTab = children.findIndex((c) => c && c.props.default);
		return defaultTab < 0 ? 0 : defaultTab;
	});

	const [collapsed, setCollapsed] = useState(false);

	const tabs = useMemo<(TabProps | undefined)[]>(() => children.map((c) => c?.props), [children]);

	return (
		<div className={ classNames('tab-container', className) } id={ id }>
			<ul className={ classNames('tab-container__header', { collapsed }) }>
				{
					tabs.map((tab, index) => (tab &&
						<button key={ index }
							className={ classNames('tab', { active: index === currentTab }, tab.className) }
							onClick={ tab.onClick ?? (() => setTab(index)) }
						>
							{tab.name}
						</button>
					))
				}
				{
					collapsable && (
						<li className='tab collapse' onClick={ () => setCollapsed(true) }>
							▲
						</li>
					)
				}
			</ul>
			{ !collapsed ? null : (
				<div className='tab-container__collapsed' onClick={ () => setCollapsed(false) }>
					▼
				</div>
			) }
			{ currentTab < children.length ? children[currentTab] : null }
		</div>
	);
}

export function Tab({ children }: TabProps): ReactElement {
	return <>{ children }</>;
}
