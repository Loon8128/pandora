import { AppearanceChangeType, LayerPriority } from 'pandora-common';
import { AssetGraphicsLayer } from '../../../assets/assetGraphics';
import { GetAssetManager } from '../../../assets/assetManager';
import { PRIORITY_ORDER_SPRITES } from '../../../graphics/def';
import { GraphicsLayer } from '../../../graphics/graphicsLayer';
import { Editor } from '../../editor';
import { DraggableBone } from '../draggable';
import { SetupLayer } from '../layer';
import { GraphicsCharacterEditor } from './editorCharacter';

export class SetupCharacter extends GraphicsCharacterEditor {
	constructor(editor: Editor) {
		super(editor);
		this._addBones();
	}

	public override getSortOrder(): readonly LayerPriority[] {
		return PRIORITY_ORDER_SPRITES;
	}

	protected override createLayer(layer: AssetGraphicsLayer): GraphicsLayer {
		return new SetupLayer(layer, this);
	}

	protected override update(changes: AppearanceChangeType[]): void {
		super.update(changes);
		if (changes.includes('pose')) {
			for (const bone of this._draggableBones) {
				bone.setRotation(this.getBone(bone.definition.name).rotation);
			}
		}
	}

	private _draggableBones: DraggableBone[] = [];
	private _addBones(): void {
		for (const bone of GetAssetManager().getAllBones()) {
			if (bone.x === 0 || bone.y === 0)
				continue;

			const draggableBone = new DraggableBone(this, bone, false);
			this._draggableBones.push(draggableBone);
			this.boneLayer.addChild(draggableBone.draggable);
		}
	}
}
