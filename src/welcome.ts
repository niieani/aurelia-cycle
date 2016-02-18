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


const aureliaPropertySetters = new Map<string, (value)=>void>()
const aureliaPropertyObservables = new Map<string, Rx.Observable<any>>()
const aureliaCallObservables = new Map<string, Rx.Observable<any>>()

function invokeAureliaBindingSetter(name, value) {
  let setter = aureliaPropertySetters.get(name)
  if (setter)
    setter(value)
  else
    console.log('error')
}
function getAureliaObservableForPropertyBinding(name) {
  return aureliaPropertyObservables.get(name)
}
function getAureliaObservableForFunctionBinding(name) {
  return aureliaCallObservables.get(name)
}

function set(name, value) {
  return { name, value }
}

function aureliaDriver(props$) {
  props$.subscribe((propArray) => {
    propArray.forEach((prop) => {
      invokeAureliaBindingSetter(prop.name, prop.value)
    })
  })
  // query props$ 
  // Use props$ as instructions to fill DOM elements
  // ...
  const AureliaSource = {
    select: function select(selector) {
      return getAureliaObservableForPropertyBinding(selector)
      // returns an object with two fields: `observable`
      // and `events()`. The former, `observable`, is the
      // Observable of DOM elements matching the given
      // `selector`. Function `events(eventType)` returns
      // the Observable of `eventType` DOM events happening
      // on the elements matched by `selector`.
    },
    selectCalls: function selectCalls(selector) {
      return getAureliaObservableForFunctionBinding(selector)
    },
  }
  return AureliaSource
}

function main({ AureliaSource }) {
  return {
    Aurelia: AureliaSource.select('someBinding').map((value) => `${value} ha!`)
  }
}
// all I need is a wrapper in attached()
// that will run:
//    return { Aurelia: this.cycle({ AureliaSource.select(this) }) }
// then we can:
/*
cycle({ AureliaSource }) {
  return AureliaSource.property('someBinding')
                      .map((value) => ([
                        set(firstName, `${value} ha!`)
                      ]))
}
*/

const interceptMethods = ['updateTarget', 'updateSource', 'callSource'];
const registeredBindings = []
// const bindingEffects = new WeakMap<string, Object>()

export class InterceptBindingBehavior {
  bind(binding, scope) { // , param, param...
    const context = scope.overrideContext.bindingContext // == Welcome
    
    const expression = binding.sourceExpression.expression
    let firstExpression = expression.expression || expression
    
    let maxNesting = 10
    while (!firstExpression.name && maxNesting--) {
      firstExpression = firstExpression.left
    }
    const name = firstExpression.name
    
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
    
    // let observableInformValueChange
    // let observableThrowError
    // let observableComplete
    
    binding['observable'] = Rx.Observable.create(function (observer: Observer<any>) {
      // Yield a single value and complete
      binding.observableInformValueChange = (value) => observer.next(value)
      binding.observableThrowError = (err) => observer.error(err)
      binding.observableComplete = () => observer.complete()
      // observer.next('42')
      // observer.error(err)
      // observer.complete()
      // Any cleanup logic might go here
      return function () {
        binding.observableInformValueChange = null
        binding.observableThrowError = null
        binding.observableComplete = null
        binding['observable'] = null
        // console.log('disposed')
      }
    })
    
    if (binding['updateSource']) {
      let method = 'updateSource'
      binding[`intercepted-${method}`] = binding[method];
      // user input - we don't need to change the underlying ViewModel, 
      // since we don't plan on using it
      //
      // we seed the value as user input to the observable 
      
      // const updateBindingValueInViewModel = binding[method].bind(binding);
      binding[method] = (function(value) {
        console.log('you changed the value of', name, value)
        binding.observableInformValueChange(value)
      }).bind(binding)
    }
    if (binding['callSource']) {
      let method = 'callSource'
      binding[`intercepted-${method}`] = binding[method];
      // triggers and delegates should be considered user input
      
      const args = firstExpression.args
      
      binding[method] = (function($event) {
        // const args = this.sourceExpression.expression.args
        let evaluatedArgs = []
        for (let arg of args) {
          evaluatedArgs.push(arg.evaluate(this.source, this.lookupFunctions, true))
        }
        console.log('you invoked a method', name, event, evaluatedArgs)
      }).bind(binding)
    }
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
    if (binding.observableUnsubscribe)
      binding.observableUnsubscribe
  }
}

export class UpperValueConverter {
  toView(value) {
    return value && value.toUpperCase();
  }
}
