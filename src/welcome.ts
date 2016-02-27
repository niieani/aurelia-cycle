//import {computedFrom} from 'aurelia-framework';

import * as Rx from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx';
import {Observable, Observer} from 'rxjs';

import Cycle from '../jspm_packages/npm/@cycle/core@7.0.0-rc1/lib/index'
import rxjsAdapter from '../jspm_packages/npm/@cycle/rxjs-adapter@1.0.0/lib/index'

import { DriverFunction } from '../jspm_packages/npm/@cycle/base@1.2.2/lib/index';

import * as _ from 'lodash'

export class Welcome {
  // mouse = Rx.Observable.fromEvent(document, 'mousemove');
  // worldPromise = Promise.resolve('awesome');
  
  propertyViewSetters = new Map<string, (value)=>void>();
  propertyObservables = new Map<string, Rx.Observable<any>>();
  eventObservables = new Map<string, Rx.Observable<any>>();
  
  constructor() {
  }
  
  bind() {
    console.log('bound')
    console.log('setters', this.propertyViewSetters)
    console.log('observables', this.propertyObservables)
    console.log('eventObservables', this.eventObservables)
    
    const sources = { WelcomeView: makeAureliaDriver(this) }
    Cycle.run(this.cycle, sources)
    // registeredBindings.forEach(observable => observable.subscribe(next => console.log(next), error => console.error(error), () => console.log('complete')))
  }
  
  cycle({ WelcomeView }:{WelcomeView:{ select:(selector)=>Observable<any>, events:(selector)=>Observable<any> }}) {
    const add$ = WelcomeView
      .events('add_click')
      .do(ev => console.log(ev))
      .map(ev => 1)

    const count$ = add$
      .startWith(0)
      .scan<number>((total, change) => total + change)

    const name$ = WelcomeView
      .select('firstName')
      .map(input => `${input} awesome`)
      .do(ev => console.log(ev))

    return {
      WelcomeView: count$.map(count =>
        ({
          count
        })
      )
    };
  }
}

// this is not required:
const _propertyViewSetters = new Map<string, (value)=>void>()
const _propertyObservables = new Map<string, Rx.Observable<any>>()
const _eventObservables = new Map<string, Rx.Observable<any>>()

function invokeAureliaBindingSetter(context, name: string, value: any) {
  const propertyViewSetters: typeof _propertyViewSetters = context.propertyViewSetters
  
  const setter = propertyViewSetters.get(name)
  if (setter)
    setter(value)
  else
    console.log('error, this binding is not two-way')
}

function getAureliaObservableForPropertyBinding(context, name: string) {
  const propertyObservables: typeof _propertyObservables = context.propertyObservables
  
  return propertyObservables.get(name)
}

function getAureliaObservableForFunctionBinding(context, name: string) {
  const eventObservables: typeof _eventObservables = context.eventObservables

  return eventObservables.get(name)
}

// function set(name, value) {
//   return { name, value }
// }

function makeAureliaDriver(context: Object) {
  const driverCreator: DriverFunction = function aureliaDriver(props$: Observable<any>) {
    props$.subscribe((propData:{ count:number }) => {
      _.keys(propData).forEach(propName => {
        // TODO: IF CHANGED
        invokeAureliaBindingSetter(context, propName, propData[propName])
      })
      // propData
      // propData.forEach((prop) => {
      //   invokeAureliaBindingSetter(prop.name, prop.value)
      // })
    })
    // query props$ 
    // Use props$ as instructions to fill DOM elements
    // ...
    const AureliaSource = {
      select: function select(selector) {
        return getAureliaObservableForPropertyBinding(context, selector)
        // returns an object with two fields: `observable`
        // and `events()`. The former, `observable`, is the
        // Observable of DOM elements matching the given
        // `selector`. Function `events(eventType)` returns
        // the Observable of `eventType` DOM events happening
        // on the elements matched by `selector`.
      },
      events: function events(selector) {
        return getAureliaObservableForFunctionBinding(context, selector)
      },
    }
    return AureliaSource
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}



// function main({ AureliaSource }) {
//   return {
//     Aurelia: AureliaSource.select('someBinding').map((value) => `${value} ha!`)
//   }
// }

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
// const registeredBindings = new Array<Observable<any>>()
// const bindingEffects = new WeakMap<string, Object>()

// function registerBinding(context, name, observable:Observable<any>) {
//   registeredBindings.push(observable)
// }

// function registerBindingInContext(context, name) {
  
// }

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
    
    console.log('Creating binding via interception', binding)
    
    // binding['observable']
    const observable:Observable<any> = Rx.Observable.create(function (observer: Observer<any>) {
      console.log('Creating binding observable', binding)
      // Yield a single value and complete
      binding.observableTriggerNextValue = (value) => observer.next(value)
      binding.observableThrowError = (err) => observer.error(err)
      binding.observableComplete = () => observer.complete()
      // observer.next('42')
      // observer.error(err)
      // observer.complete()
      // Any cleanup logic might go here
      return function () {
        binding.observableTriggerNextValue = undefined
        binding.observableThrowError = undefined
        binding.observableComplete = undefined
        binding['observable'] = undefined
        // console.log('disposed')
      }
    })
    binding.observable = observable
    
    if (binding['updateTarget']) {
      let method = 'updateTarget'
      binding[`intercepted-${method}`] = binding[method];
      // seed default value of the binding
      // this shouldn't happen more than once (?)
      // update is the "setter" for the View
      const updateBindingValueInView = binding[method].bind(binding);
      binding[method] = (function(value) { 
        updateBindingValueInView(value)
        console.log('the initial value was seeded for the observable', name, value)
        // if (binding.observableTriggerNextValue !== undefined)
        //   binding.observableTriggerNextValue(value)
      }).bind(binding)
      
      context.propertyViewSetters.set(name, updateBindingValueInView)
    }
    
    // let observableTriggerNextValue
    // let observableThrowError
    // let observableComplete
    
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
        if (binding.observableTriggerNextValue !== undefined)
          binding.observableTriggerNextValue(value)
      }).bind(binding)
      
      context.propertyObservables.set(name, observable)
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
        if (binding.observableTriggerNextValue !== undefined)
          binding.observableTriggerNextValue({ event, arguments: evaluatedArgs })
      }).bind(binding)
      
      context.eventObservables.set(name, observable)
    }
    // registerBinding(context, name, observable)
  }

  unbind(binding, scope) {
    let i = interceptMethods.length;
    while (i--) {
      let method = interceptMethods[i];
      if (!binding[method]) {
        continue;
      }
      binding[method] = binding[`intercepted-${method}`];
      binding[`intercepted-${method}`] = undefined;
    }
    if (binding.observableUnsubscribe) {
      binding.observableUnsubscribe()
    }
    if (binding.observable) {
      binding.observableTriggerNextValue = undefined
      binding.observableThrowError = undefined
      binding.observableComplete = undefined
      binding['observable'] = undefined
    }
  }
}

/**
 * we need to build a tree for the in/out of the cycle
 * it's not a dom tree, but a data tree
 * 
 */

 const example = {
   app: [{ 
     viewModel: 'Welcome',
     properties: [
       { name: 'someBinding', value: 'someVal' }
     ],
     methods: [
       { name: 'someMethod', value: 'Observable' }
     ]
    }]
 }

// export class UpperValueConverter {
//   toView(value) {
//     return value && value.toUpperCase();
//   }
// }
