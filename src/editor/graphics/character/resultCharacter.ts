import { Character } from '../../../character/character';
import { EditorScene } from '../editorScene';
import { ResultLayer } from '../layer';
import { EditorCharacter } from './editorCharacter';

export class ResultCharacter extends EditorCharacter {
	constructor(character: Character) {
		super(character);
		this._addBones();
		this.onWindowResize();
	}

	protected override createLayer = ResultLayer.create;

	private _addBones(): void {
		for (const bone of this.observableBones) {
			if (bone.x === 0 && bone.y === 0)
				continue;

			// TODO: implement draggable rotation
		}
	}

	protected override onWindowResize(): void {
		super.onWindowResize();
		this.x = EditorScene.width / 2;
	}
}
