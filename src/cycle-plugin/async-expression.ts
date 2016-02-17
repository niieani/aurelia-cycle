declare module 'aurelia-binding' {
  class Expression implements Expression {}
}

import {Expression, getContextFor} from 'aurelia-binding';
import {AsyncObserver} from './async-observer';

export class AsyncExpression extends Expression {
  constructor(private expression, private ready) {
    super();
    // this.expression = expression;
    // this.ready = ready;
  }

  evaluate(scope, valueConverters) {
    let observable = this.expression.evaluate(scope);
    if (observable) {
      return this.ready ? observable.hasOwnProperty('__value') : observable.__value;
    }
    return this.ready ? false : undefined;
  }

  accept(visitor) {
    this.expression.accept(visitor);
		visitor.write('..');
  }

  connect(binding, scope) {
    this.expression.connect(binding, scope);
    var context = getContextFor(this.name, scope, this.ancestor);
    let observer = binding.observeProperty(context, this.name);
    //binding.getObserver(scope, this.name);
    // let value = observer.getValue();
    let value = this.expression.evaluate(scope);
    
    let properObserver = new AsyncObserver(value, observer, this.ready);
    
    console.log('binding', binding, 'scope', scope, 'this', this, 'value', value);
    // addObserver.call(this, observer);
    
    // let context = getContextFor(this.name, scope, this.ancestor);
    // let observer = binding.observeProperty(scope, this.name);
    
    
    
    
    // var context = getContextFor(this.name, scope, this.ancestor);
    // binding.observeProperty(context, this.name);
    
    // var observer = binding.getObserver(scope, this.name);
    
    // let info = this.expression.connect(binding, scope);
    // if (!info) { 
    //   console.log('no info', this.expression);
    //   return;
    // } 
    // return {
    //   value: info.value ? info.value.__value : undefined,
    //   observer: new AsyncObserver(info.value, info.observer, this.ready)
    // };
  }
}
