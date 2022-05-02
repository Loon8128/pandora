import { useEffect, useState } from 'react';
import { TypedEvent, TypedEventEmitter } from './event';

/** Class that stores value of type T, while allowing subscribers to observe reference changes */
export class Observable<T> {
	private _value: T;
	private readonly _observers: Set<(value: T) => void> = new Set();

	constructor(defaultValue: T) {
		this._value = defaultValue;
	}

	/** Get the current value */
	public get value(): T {
		return this._value;
	}

	/** Set a new value, notifying all observers */
	public set value(value: T) {
		if (this._value !== value) {
			this._value = value;
			this._observers.forEach((observer) => observer(value));
		}

	}

	public subscribe(observer: (value: T) => void): () => void {
		this._observers.add(observer);
		return () => this._observers.delete(observer);
	}
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function useObservable<T>(obs: Observable<T>): T {
	const [value, setValue] = useState<T>(obs.value);
	useEffect(() => {
		setValue(obs.value);
		return obs.subscribe(setValue);
	}, [obs]);
	return value;
}

export abstract class ObservableClass<T extends TypedEvent> extends TypedEventEmitter<T> {
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function observable<T extends TypedEvent, K extends keyof T>(target: ObservableClass<T> & T, key: K) {
	const symbol: unique symbol = Symbol(key as string);
	type Accessor = { [S in typeof symbol]: T[K] };
	Object.defineProperty(target, symbol, {
		value: target[key],
		writable: true,
		enumerable: false,
		configurable: false,
	});
	Object.defineProperty(target, key, {
		get() {
			const accessor = this as Accessor;
			return accessor[symbol];
		},
		set(newValue: T[K]) {
			const accessor = this as Accessor;
			if (accessor[symbol] !== newValue) {
				accessor[symbol] = newValue;
				// @ts-expect-error: call protected method
				target.emit.apply(this, [key, accessor[symbol]]);
			}
		},
		enumerable: true,
		configurable: true,
	});
}
