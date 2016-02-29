import {Observable, Observer, Subscription} from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
import Cycle from '../jspm_packages/npm/@cycle/core@7.0.0-rc1/lib/index'
import rxjsAdapter from '../jspm_packages/npm/@cycle/rxjs-adapter@1.0.0/lib/index'
import { DriverFunction } from '../jspm_packages/npm/@cycle/base@1.2.2/lib/index'

// this is not required:
class AureliaCycle {
  static _propertyViewSetters: Map<string, (value)=>void>;
  static _aureliaFromViewObservables: Map<string, Rx.Observable<any> & { _aureliaType: 'event' | 'property' }>;
  static _aureliaToViewObservables: Map<string, Rx.Observable<any>>;
  static _aureliaViewValues: Map<string, string>;
}

/**
 * we need to build a tree for the in/out of the cycle
 * it's not a dom tree, but a data tree
 * 
 */

function invokeAureliaBindingSetter(context, name: string, value: any) {
  const propertyViewSetters: typeof AureliaCycle._propertyViewSetters = context.propertyViewSetters
  // const aureliaToViewObservables: typeof AureliaCycle._aureliaToViewObservables = context.aureliaToViewObservables
  
  const setter = propertyViewSetters.get(name)
  // const setter = aureliaToViewObservables.get(name)
  if (setter)
    // setter.next(value)
    setter(value)
  else
    console.log('error, this binding is not two-way')
}

function getAureliaObservableForBinding(context, name: string) {
  const aureliaFromViewObservables: typeof AureliaCycle._aureliaFromViewObservables = context.aureliaFromViewObservables
  const aureliaToViewObservables: typeof AureliaCycle._aureliaToViewObservables = context.aureliaToViewObservables
  
  let fromView = aureliaFromViewObservables.get(name)
  let toView = aureliaToViewObservables.get(name)
  
  // console.log('toView', toView, 'fromView', fromView, 'merged', Observable.merge(fromView, toView))
  const returnObservable: typeof AureliaCycle._aureliaFromViewObservables = toView && fromView ? Observable.merge(fromView, toView) : toView || fromView
  // const returnObservable: typeof AureliaCycle._aureliaFromViewObservables = toView ? Observable.merge(fromView, toView) : fromView
  returnObservable._aureliaType = fromView ? fromView._aureliaType : 'property'
  return returnObservable
  // return fromView
}

export function makeAureliaDriver(context: any) {
  console.log('requested to make aurelia driver for', context)
  const driverCreator: DriverFunction = function aureliaDriver(props$) {
    props$.subscribe((propData) => {
      Object.keys(propData).forEach(propName => {
        const newValue = propData[propName]
        const previousValue = context.aureliaViewValues.get(propName)
        
        if (previousValue !== newValue) {
          console.log('previous value different, setting', propName, previousValue, newValue)
          // TODO: instead of always setting the binding value, 
          // we should intelligently compare to see if it's an array or map or set
          // and mutate accordingly to make use of Aurelia's diffing algos
          invokeAureliaBindingSetter(context, propName, newValue)
        } 
        // else {
        //   console.log('previous value equal, not setting', propName, previousValue, newValue)
        // }
      })
    })
    // query props$ 
    // Use props$ as instructions to fill binding properties
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
      },
    }
    return AureliaSource
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

const interceptMethods = ['updateTarget', 'updateSource', 'callSource']

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
    
    console.log('Creating binding via interception', name)
    
    // TODO: don't create toView when 'callSource' type
    
    let toViewObservers = new Set<Observer<string>>()
    
    const toViewObservable:Observable<any> = Observable.create(function (observer: Observer<any>) {
      console.log('Creating toView binding observable for:', name)
      // Yield a single value and complete
      toViewObservers.add(observer)
      // Any cleanup logic might go here
      return function () {
        console.log('disposed of toView observable for', name)
        toViewObservers.delete(observer)        
      }
    })

    binding.toViewObservable = toViewObservable
    binding.toViewObservers = toViewObservers
    context.aureliaToViewObservables.set(name, toViewObservable)
    
    let toViewSubscription: Subscription
    
    if (binding['updateTarget']) {
      let method = 'updateTarget'
      binding[`intercepted-${method}`] = binding[method]
      
      const updateBindingValueInView = binding[method].bind(binding);
      
      toViewSubscription = toViewObservable.subscribe(value => {
        // console.log('updating toView', name, value)
        updateBindingValueInView(value)
      }, error => console.error('Error in a toViewObservable', name))
      
      const toViewObserversNextAll = (value) => {
        toViewObservers.forEach(observer => observer.next(value))
      }
      
      // seed default value of the binding
      // this shouldn't happen more than once (?)
      // update is the "setter" for the View
      // binding[method] = toViewObserversNextAll
      binding[method] = (value) => {
        context.cycleStarted.then(() => {
          // TODO: should we seed an initial value if it is undefined?
          if (value !== undefined) {
            console.log('an initial value was seeded to the observable', name, value)
            toViewObserversNextAll(value)
          }
        })
        // toViewObservers.forEach(observer => observer.next(value))
      }
      
      context.propertyViewSetters.set(name, toViewObserversNextAll)
    }
    
    let allChanges = toViewObservable
    
    if (binding['updateSource'] || binding['callSource']) {
      let fromViewObservers = new Set<Observer<string|{event; arguments}>>()
      
      const fromViewObservable:Observable<any> = Observable.create(function (observer: Observer<any>) {
        console.log('Creating fromView binding observable for:', name)
        // Yield a single value and complete
        fromViewObservers.add(observer)
        // Any cleanup logic might go here
        return function () {
          console.log('disposed of fromView observable for', name)
          fromViewObservers.delete(observer)
        }
      })
      
      binding.fromViewObservable = fromViewObservable
      binding.fromViewObservers = fromViewObservers
      context.aureliaFromViewObservables.set(name, fromViewObservable)
      
      if (binding['updateSource']) {
        let method = 'updateSource'
        binding[`intercepted-${method}`] = binding[method];
        // user input - we don't need to change the underlying ViewModel, 
        // since we don't plan on using it
        //
        // we seed the value as user input to the observable 
        
        binding[method] = (value) => {
          // console.log('you changed the value of', name, value)
          fromViewObservers.forEach(observer => observer.next(value))
        }
        
        fromViewObservable['_aureliaType'] = 'property'
        allChanges = Observable.merge(fromViewObservable, toViewObservable)
      }
      
      if (binding['callSource']) {
        let method = 'callSource'
        binding[`intercepted-${method}`] = binding[method]
        // triggers and delegates should be considered user input
        
        const args = firstExpression.args
        
        binding[method] = ($event) => {
          let evaluatedArgs = []
          for (let arg of args) {
            evaluatedArgs.push(arg.evaluate(binding.source, binding.lookupFunctions, true))
          }
          // console.log('you invoked a method', name, event, evaluatedArgs)
          fromViewObservers.forEach(observer => observer.next({ event, arguments: evaluatedArgs }))          
        }
        
        fromViewObservable['_aureliaType'] = 'event'
      }
    }
    
    if (binding['updateSource'] || binding['updateTarget']) {
      binding.allChangesObservable = 
        allChanges.subscribe(
          (value) => {
            // console.log('a value was set', name, value)
            context.aureliaViewValues.set(name, value)
          }, 
          (error) => console.error(error.message), 
          () => {
            console.log('completed allChangesObservable', name)
            binding.allChangesObservable = undefined
          }
        )
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
    if (binding.toViewObservable) {
      binding.toViewObservers.forEach(observer => observer.complete())
      binding.toViewObservers = undefined
      binding.toViewObservable = undefined
    }
    if (binding.fromViewObservable) {
      binding.fromViewObservers.forEach(observer => observer.complete())
      binding.fromViewObservers = undefined
      binding.fromViewObservable = undefined
    }
  }
}
