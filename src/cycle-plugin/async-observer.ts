import {ObserverLocator, ObjectObservationAdapter} from 'aurelia-binding';


export class AsyncObserver { //extends ObjectObservationAdapter
  getObserver(obj, propertyName, descriptor) {
    
  }
  
	constructor(private observable, private observer, private ready) {
    // super();
	}
  
  lastValue;
  context;
  callable;

	attach() {
		let observable = this.observable = (this.observer ? this.observer.getValue() : this.observable);
		if (!observable) {
			return;
		}
		let subscribe = observable.subscribeOnNext || observable.then;
    if (subscribe) {
			subscribe.call(observable, value => {
				if (observable !== this.observable) {
					return;
				}
	      observable.__value = value;
				this.notify();
			});
			return;
		}
		throw new Error('Object is not "promise-like" or "observable-like".');
	}

  getValue() {
    return 'abc';
  }

  setValue() {
    throw new Error(`Observable cannot be assigned.`);
  }

	getCurrent() {
		let observable = this.observable = (this.observer ? this.observer.getValue() : this.observable);
		if (observable) {
			return this.ready ? observable.hasOwnProperty('__value') : observable.__value;
		}
		return this.ready ? false : undefined;
	}

  notify() {
		let newValue = this.getCurrent();
		let oldValue = this.lastValue;

    if (!this.context || newValue === oldValue) {
      return;
    }

		this.lastValue = newValue;
		this.callable.call(this.context, newValue, oldValue);
  }

	call(context, newValue, oldValue) {
		if (newValue === this.observable) {
			return;
		}
		this.observable = newValue;
		this.attach();
		this.notify();
	}

	subscribe(context, callable) {
		this.context = context;
		this.callable = callable;

		if (this.observer) {
	    this.lastValue = this.getCurrent();
			this.observer.subscribe('AsyncObserver', this);
		}

		this.attach();
	}

	unsubscribe(context, callable) {
		this.context = null;
		this.callable = null;

		if (this.observer) {
			this.lastValue = undefined;
			this.observer.unsubscribe('AsyncObserver', this);
		}
	}
}

// ObserverLocator.addAdapter(AsyncObserver);




export class AsyncObserver2 {
  doNotCache = true;

  constructor(private observable, private observer, private ready) {
  }


	getCurrent() {
		let observable = this.observable = (this.observer ? this.observer.getValue() : this.observable);
		if (observable) {
			return this.ready ? observable.hasOwnProperty('__value') : observable.__value;
		}
		return this.ready ? false : undefined;
	}
  getValue() {
    return this.primitive[this.propertyName];
  }

  setValue() {
    let type = typeof this.primitive;
    throw new Error(`The ${this.propertyName} property of a ${type} (${this.primitive}) cannot be assigned.`);
  }

  subscribe() {
  }

  unsubscribe() {
  }
  
  lastValue;
  context;
  callable;

	attach() {
		let observable = this.observable = (this.observer ? this.observer.getValue() : this.observable);
		if (!observable) {
			return;
		}
		let subscribe = observable.subscribeOnNext || observable.then;
    if (subscribe) {
			subscribe.call(observable, value => {
				if (observable !== this.observable) {
					return;
				}
	      observable.__value = value;
				this.notify();
			});
			return;
		}
		throw new Error('Object is not "promise-like" or "observable-like".');
	}

  notify() {
		let newValue = this.getCurrent();
		let oldValue = this.lastValue;

    if (!this.context || newValue === oldValue) {
      return;
    }

		this.lastValue = newValue;
		this.callable.call(this.context, newValue, oldValue);
  }
}
