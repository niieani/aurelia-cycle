//import {computedFrom} from 'aurelia-framework';
// import Rx from './rx';
// import Rx from 'rxjs-es';

import * as Rx from '../jspm_packages/npm/rxjs@5.0.0-beta.1/Rx';

export class Welcome {
  // mouse = Rx.Observable.fromEvent(document, 'mousemove');
  // worldPromise = Promise.resolve('awesome');
  
  constructor() {
    // console.log(this.mouse);
    // let i = 0
    // setInterval(() => {
    //   this.someMethod = function (text) {
    //     console.log('called someMethod ' + i, arguments)
    //   }
    //   i++
    // }, 1000)
  }
  
  heading = 'Welcome to the Aurelia Navigation App!';
  firstName = 'John';
  lastName = 'Doe';
  previousValue = this.fullName;

  // someMethod = function (text) {
  //   console.log('called someMethod', arguments)
  // }

  //Getters can't be directly observed, so they must be dirty checked.
  //However, if you tell Aurelia the dependencies, it no longer needs to dirty check the property.
  //To optimize by declaring the properties that this getter is computed from, uncomment the line below
  //as well as the corresponding import above.
  //@computedFrom('firstName', 'lastName')
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }

  submit() {
    this.previousValue = this.fullName;
    alert(`Welcome, ${this.fullName}!`);
  }

  canDeactivate() {
    if (this.fullName !== this.previousValue) {
      return confirm('Are you sure you want to leave?');
    }
  }
  
}


const interceptMethods = ['updateTarget', 'updateSource', 'callSource'];

function actOnExpression (methodName: 'updateTarget' | 'updateSource' | 'callSource', update: (newValue) => void, newValueOrEvent?) {
  // this: binding
  // console.log(this, methodName, update)
  
  if (methodName == 'updateTarget') {
    update(newValueOrEvent) // initial value from the binding
    console.log('target was updated', arguments) // this shouldn't happen more than once!
  } else if (methodName == 'updateSource') { //
    let expression = this.sourceExpression.expression
    while (!expression.name) {
      expression = expression.left
    }
    const name = expression.name
    console.log('hi there, you changed the value of', name, newValueOrEvent)
    // setting set externally
  } else {
    // update(newValueOrEvent)
    let args = this.sourceExpression.expression.args
    let evaluatedArgs = []
    for (let arg of args) {
      evaluatedArgs.push(arg.evaluate(this.source, this.lookupFunctions, true))
    }
    console.log('call source', arguments, evaluatedArgs)
    // console.log('call source', this, arguments)
  }
    //update('yo yo yo')
  // setTimeout(() => update('ho ho ho'), 1000)
  // return this[method]
}

const registeredBindings = []

export class InterceptBindingBehavior {
  bind(binding, scope) { // , param, param...
    const context = scope.overrideContext.bindingContext // == Welcome
    
    if (binding['updateTarget']) {
      let method = 'updateTarget'
      binding[`intercepted-${method}`] = binding[method];
      // seed default value of the binding
      // this shouldn't happen more than once (?)
      // update is the "setter" for the View
      const updateBindingValueInView = binding[method].bind(binding);
      binding[method] = (function(value) { 
        updateBindingValueInView(value) 
      }).bind(binding)
    }
    if (binding['updateSource']) {
      let method = 'updateSource'
      binding[`intercepted-${method}`] = binding[method];
      // user input - we don't need to change the underlying ViewModel, 
      // since we don't plan on using it
      //
      // we seed the value as user input to the observable 
      
      let expression = binding.sourceExpression.expression
      while (!expression.name) {
        expression = expression.left
      }
      const name = expression.name
      
      // const updateBindingValueInViewModel = binding[method].bind(binding);
      binding[method] = (function(value) {
        console.log('you changed the value of', name, value)
      }).bind(binding)
    }
    if (binding['callSource']) {
      let method = 'callSource'
      binding[`intercepted-${method}`] = binding[method];
      // triggers and delegates should be considered user input
      
      binding[method] = (function($event) {
        const args = this.sourceExpression.expression.args
        let evaluatedArgs = []
        for (let arg of args) {
          evaluatedArgs.push(arg.evaluate(this.source, this.lookupFunctions, true))
        }
        console.log('you invoked a method', event, evaluatedArgs)
      }).bind(binding)
    }
    
    console.log(scope.overrideContext.bindingContext) // == Welcome
    // todo: check behaviour in repeaters
    let i = interceptMethods.length;
    while (i--) {
      let method = interceptMethods[i];
      if (!binding[method]) {
        continue;
      }
      binding[`intercepted-${method}`] = binding[method];
      let update = binding[method].bind(binding);
      binding[method] = actOnExpression.bind(binding, method, update);
    }
    registeredBindings.push({
      name: '',
      view: Welcome
    })
  }

  unbind(binding, scope) {
    let i = interceptMethods.length;
    while (i--) {
      let method = interceptMethods[i];
      if (!binding[method]) {
        continue;
      }
      binding[method] = binding[`intercepted-${method}`];
      binding[`intercepted-${method}`] = null;
    }
  }
}



export class UpperValueConverter {
  toView(value) {
    return value && value.toUpperCase();
  }
}
