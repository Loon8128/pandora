import React, { MouseEvent, useCallback, useState } from 'react';
import { ReactElement } from 'react';
import { ChildrenProps } from '../../common/reactTypes';
import { useEvent } from '../../common/useEvent';
import { Button } from '../common/button/button';
import { Column } from '../common/container/container';
import { DraggableDialog } from '../dialog/dialog';
import helpIcon from '../../assets/icons/help.svg';
import './contextHelpButton.scss';
import { useKeyDownEvent } from '../../common/useKeyDownEvent';

export function ContextHelpButton({ children }: ChildrenProps): ReactElement {
	const [open, setOpen] = useState(false);

	const toggleOpen = useEvent((ev: MouseEvent) => {
		ev.preventDefault();
		ev.stopPropagation();
		setOpen(!open);
	});

	const close = useCallback((ev: MouseEvent | KeyboardEvent) => {
		ev.preventDefault();
		ev.stopPropagation();
		setOpen(false);
	}, []);

	useKeyDownEvent(close, 'Escape');

	return (
		<>
			<button className='help-button' onClick={ toggleOpen }>
				<img src={ helpIcon } alt='Help' />
			</button>
			{ !open ? null : (
				<DraggableDialog title='Help'>
					<Column padding='medium' className='flex-1'>
						{ children }
					</Column>
					<Button className='slim' onClick={ close }>Close</Button>
				</DraggableDialog>
			) }
		</>
	);
}
