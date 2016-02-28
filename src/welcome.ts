//import {computedFrom} from 'aurelia-framework';

import * as Rx from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
import {Observable, Observer} from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
// import {Observable, Observer} from 'rxjs'

import Cycle from '../jspm_packages/npm/@cycle/core@7.0.0-rc1/lib/index'
import rxjsAdapter from '../jspm_packages/npm/@cycle/rxjs-adapter@1.0.0/lib/index'

import { DriverFunction } from '../jspm_packages/npm/@cycle/base@1.2.2/lib/index';

import * as _ from 'lodash'

export class Welcome {
  // mouse = Rx.Observable.fromEvent(document, 'mousemove');
  // worldPromise = Promise.resolve('awesome');
  
  propertyViewSetters = new Map<string, (value)=>void>();
  aureliaObservables = new Map<string, Rx.Observable<any>>();
  eventObservables = new Map<string, Rx.Observable<any>>();
  
  constructor() {
  }
  
  bind() {
    console.log('bound')
    console.log('setters', this.propertyViewSetters)
    console.log('observables', this.aureliaObservables)
    console.log('eventObservables', this.eventObservables)
    
    const sources = { WelcomeView: makeAureliaDriver(this) }
    Cycle.run(this.cycle, sources)
    // registeredBindings.forEach(observable => observable.subscribe(next => console.log(next), error => console.error(error), () => console.log('complete')))
  }
  
  cycle({ WelcomeView }:{WelcomeView:{ select:(selector)=>Observable<any>, events:(selector)=>Observable<any> }}) {
    const add$ = WelcomeView
      .events('add_click')
      // .do(ev => console.log(ev))
      .map(ev => 1)

    const count$ = add$
      .startWith(0)
      .scan<number>((total, change) => total + change)

    const name$ = WelcomeView
      .select('firstName')
      .startWith('')
      .map(input => `${input} awesome`)
      // .do(ev => console.log(ev))

    // console.log(count$)

    return {
      WelcomeView: Observable.combineLatest(
        count$, name$,
        (count, name) => ({ countText: `${count} : ${name}` })
      )
    }
  }
}

// this is not required:
const _propertyViewSetters = new Map<string, (value)=>void>()
const _aureliaObservables = new Map<string, Rx.Observable<any> & { _aureliaType: 'event' | 'property' }>()
// const _eventObservables = new Map<string, Rx.Observable<any>>()

function invokeAureliaBindingSetter(context, name: string, value: any) {
  const propertyViewSetters: typeof _propertyViewSetters = context.propertyViewSetters
  
  const setter = propertyViewSetters.get(name)
  if (setter)
    setter(value)
  else
    console.log('error, this binding is not two-way')
}

function getAureliaObservableForBinding(context, name: string) {
  const aureliaObservables: typeof _aureliaObservables = context.aureliaObservables
  
  return aureliaObservables.get(name)
}

// function getAureliaObservableForFunctionBinding(context, name: string) {
//   const eventObservables: typeof _eventObservables = context.eventObservables

//   return eventObservables.get(name)
// }

// function set(name, value) {
//   return { name, value }
// }

function makeAureliaDriver(context: any) {
  const driverCreator: DriverFunction = function aureliaDriver(props$) {
    // console.log(props$)
    // Object.keys(props).forEach(propName => {
    //   const prop$ = props[propName] as Observable<any>
    //   if (prop$) {
    //     prop$.subscribe(propValue => {
    //       invokeAureliaBindingSetter(context, propName, propValue)
    //     })
    //   }
    // })
    props$.subscribe((propData) => { //:{ count:number }
      // console.log('propData', propData)
      Object.keys(propData).forEach(propName => {
        // TODO: IF CHANGED
        const newValue = propData[propName]
        const observable = context.aureliaObservables.get(propName)
        const previousValue = observable ? observable.last() : undefined
        if (previousValue !== newValue) {
          console.log('previous value different, setting', propName, previousValue, newValue)
          invokeAureliaBindingSetter(context, propName, newValue)
        }
      })
    })
    // query props$ 
    // Use props$ as instructions to fill DOM elements
    // ...
    const AureliaSource = {
      select: function select(selector) {
        const observable = getAureliaObservableForBinding(context, selector)
        return observable && observable._aureliaType === 'property' ? observable : null
        // returns an object with two fields: `observable`
        // and `events()`. The former, `observable`, is the
        // Observable of DOM elements matching the given
        // `selector`. Function `events(eventType)` returns
        // the Observable of `eventType` DOM events happening
        // on the elements matched by `selector`.
      },
      events: function events(selector) {
        const observable = getAureliaObservableForBinding(context, selector)
        return observable && observable._aureliaType === 'event' ? observable : null
        // return getAureliaObservableForFunctionBinding(context, selector)
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
      console.log('Creating binding observable for:', name)
      // Yield a single value and complete
      binding.observableTriggerNextValue = (value) => observer.next(value)
      binding.observableThrowError = (err) => observer.error(err)
      binding.observableComplete = () => observer.complete()
      
      if (binding.observableInitialValue !== undefined) {
        const initValue = binding.observableInitialValue
        console.log('the initial value was seeded to the observable', name, initValue)
        observer.next(initValue)
      }
      
      // observer.next('42')
      // observer.error(err)
      // observer.complete()
      // Any cleanup logic might go here
      return function () {
        binding.observableTriggerNextValue = undefined
        binding.observableThrowError = undefined
        binding.observableComplete = undefined
        binding.observable = undefined
        // console.log('disposed')
      }
    })
    binding.observable = observable
    context.aureliaObservables.set(name, observable)
    
    if (binding['updateTarget']) {
      let method = 'updateTarget'
      binding[`intercepted-${method}`] = binding[method];
      // seed default value of the binding
      // this shouldn't happen more than once (?)
      // update is the "setter" for the View
      const updateBindingValueInView = binding[method].bind(binding);
      binding[method] = (function(value) { 
        updateBindingValueInView(value)
        binding.observableInitialValue = value
        
        if (binding.observableTriggerNextValue !== undefined) {
          console.log('a value was seeded to the observable', name, value)
          binding.observableTriggerNextValue(value)
        }
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
      
      observable['_aureliaType'] = 'property'
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
      
      observable['_aureliaType'] = 'event'
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
