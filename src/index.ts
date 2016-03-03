import {View} from 'aurelia-templating';
import {Observable, Observer, Subscription} from 'rxjs/Rx'
import Cycle from '@cycle/core/lib/index'
import rxjsAdapter from '@cycle/rxjs-adapter/lib/index'
import { DriverFunction } from '@cycle/base'

import * as TheLogManager from 'aurelia-logging'

// export { default as Cycle } from '@cycle/core/lib/index'
// export { Subject, Scheduler, Observable, Observer, Operator, Subscriber, Subscription, Symbol, AsyncSubject, ReplaySubject, BehaviorSubject, ConnectableObservable, Notification, EmptyError, ArgumentOutOfRangeError, ObjectUnsubscribedError, UnsubscriptionError } from 'rxjs/Rx'

const logger = TheLogManager.getLogger('aurelia-cycle')

export function configure(frameworkConfig) {
  const bindingBehaviorInstance = frameworkConfig.container.get(CycleBindingBehavior)
  frameworkConfig.aurelia.resources.registerBindingBehavior('cycle', bindingBehaviorInstance) //new CycleBindingBehavior()
  
  const originalBind:(scope)=>void = View.prototype.bind
  
  View.prototype.bind = function bind(context: any, overrideContext?: Object, _systemUpdate?: boolean): void {
    let sources
    
    if (context && typeof context.cycle == 'function') {
      function getDefaultSources() {
        return { [context.constructor.name + 'View']: makeAureliaDriver(context) }
      }
      
      // console.log('sources', context, context.cycleDrivers, scope)
      sources = context.cycleDrivers
      // logger.debug('starting post-binding for cycle hook', sources, typeof sources, context.constructor.name + 'View', context.constructor.name + 'View' in sources)
      
      if (sources && typeof sources == 'object') {
        if (!(context.constructor.name + 'View' in sources))
          Object.assign(sources, getDefaultSources())
        // logger.debug('using preset sources', sources)
      } else {
        // logger.debug('using default sources', sources)
        sources = getDefaultSources()
      }
    }
    
    originalBind.apply(this, arguments)
    
    if (sources) {
      // const sources = context.cycleDrivers || { [context.constructor.name + 'View']: makeAureliaDriver(context) }
      
      Cycle.run(context.cycle.bind(context), sources)
      // seed initial values:
      context.cycleStartedResolve()
      // logger.debug('started post-binding for cycle hook', context)
    }
  }
  
  /*
  const originalEnsurePropertiesDefined = HtmlBehaviorResource.prototype._ensurePropertiesDefined
  HtmlBehaviorResource.prototype._ensurePropertiesDefined = function _ensurePropertiesDefined(instance: Object, lookup: Object) {
    logger.debug('HtmlBehaviorResource', instance, lookup, this, this.properties)
    originalEnsurePropertiesDefined.apply(this, arguments)    
  }
  */
}

export type PropertyViewSetterMap = Map<string, (value)=>void>;
export type ViewObservable = Observable<string | number>;

export type FromViewActionObservable = Observable<Action> & { _aureliaType: 'action' | 'property' };
export type FromViewValueObservable = ViewObservable & { _aureliaType: 'action' | 'property' };

export type FromViewObservable = FromViewActionObservable | FromViewValueObservable;
export type FromViewObservableMap = Map<string, FromViewObservable>;
export type ViewObservableMap = Map<string, ViewObservable>;
export type ViewValues = Map<string, string | number>;
export type AnyEvent = Event | FocusEvent | GamepadEvent | HashChangeEvent | KeyboardEvent | MessageEvent | MouseEvent | MouseWheelEvent | MSGestureEvent | MSManipulationEvent | MSMediaKeyMessageEvent | MSMediaKeyNeededEvent | MSSiteModeEvent | MutationEvent | NavigationCompletedEvent | NavigationEvent | NavigationEventWithReferrer | OfflineAudioCompletionEvent | PageTransitionEvent | PermissionRequestedEvent | PointerEvent | PopStateEvent | ProgressEvent | ScriptNotifyEvent | StorageEvent | SVGZoomEvent | TextEvent | TouchEvent | TrackEvent | TransitionEvent | UIEvent | UnviewableContentIdentifiedEvent | WebGLContextEvent | WheelEvent;
export type Action = { event: AnyEvent, arguments: Array<any> };
export type ViewSource = { values: (bindingName: string) => FromViewValueObservable, actions: (bindingName: string) => FromViewActionObservable };

function invokeAureliaBindingSetter(context: any, name: string, value: string) {
  const previousValue = context.aureliaViewValues.get(name)
  
  if (previousValue !== value) {
    // previous value different 
    // logger.debug(`setting ${name}: from '${previousValue}' to '${value}'`)
    
    // TODO: instead of always setting the binding value, 
    // we should intelligently compare to see if it's an array or map or set
    // and mutate accordingly to make use of Aurelia's diffing algos
    
    const propertyViewSetters: PropertyViewSetterMap = context.propertyViewSetters
    // const aureliaToViewObservables: ViewObservables = context.aureliaToViewObservables
    
    const setter = propertyViewSetters.get(name)
    if (setter)
      setter(value)
    else
      logger.error(`the binding (${name}) is not a two-way binding and you cannot set it!`)
  }
  // else {
  //   logger.debug('previous value equal, not setting', propName, previousValue, newValue)
  // }
}

function getAureliaObservableForBinding(context: any, name: string) {
  const aureliaFromViewObservables: FromViewObservableMap = context.aureliaFromViewObservables
  const aureliaToViewObservables: ViewObservableMap = context.aureliaToViewObservables
  
  let fromView = aureliaFromViewObservables.get(name)
  let toView = aureliaToViewObservables.get(name)
  
  const returnObservable: FromViewObservable = toView && fromView ? Observable.merge<FromViewObservable, FromViewObservable>(fromView, toView) : toView as any || fromView
  
  returnObservable._aureliaType = fromView ? fromView._aureliaType : 'property'
  return returnObservable
}

/**
 * we need to build a tree for the in/out of the cycle
 * it's not a dom tree, but a data tree
 */
export function makeAureliaDriver(context: any) {
  // logger.debug('requested to make aurelia driver for', context)
  
  const driverCreator: DriverFunction = function aureliaDriver(props$) {
    props$.subscribe((propData) => {
      Object.keys(propData).forEach(propName => {
        const newValue = propData[propName]
        invokeAureliaBindingSetter(context, propName, newValue)
      })
    })
    
    const AureliaSource = {
      values: function values(bindingName: string) {
        const observable = getAureliaObservableForBinding(context, bindingName)
        if (!observable || observable._aureliaType != 'property')
          throw new Error(`Cannot select an unexistent binding ${bindingName}`)
        return observable
      },
      actions: function actions(bindingName: string) {
        const observable = getAureliaObservableForBinding(context, bindingName)
        if (!observable || observable._aureliaType != 'action')
          throw new Error(`Cannot select an unexistent binding ${bindingName}`)
        return observable
      },
    }
    return AureliaSource
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  
  // aurelia specific
  if (!context.propertyViewSetters)
    context.propertyViewSetters = new Map<string, (value)=>void>()

  if (!context.aureliaFromViewObservables)
    context.aureliaFromViewObservables = new Map<string, Observable<any>>()

  if (!context.aureliaToViewObservables)
    context.aureliaToViewObservables = new Map<string, Observable<any>>()

  if (!context.aureliaViewValues)
    context.aureliaViewValues = new Map<string, string>()
  
  if (!context.cycleStarted || !context.cycleStartedResolve)
    context.cycleStarted = new Promise<void>((resolve) => context.cycleStartedResolve = resolve)
  
  return driverCreator
}

const interceptMethods = ['updateTarget', 'updateSource', 'callSource']

export class CycleBindingBehavior {
  bind(binding, scope, name) { // , param, param...
    const context = scope.overrideContext.bindingContext // == Welcome
    
    const expression = binding.sourceExpression.expression
    let firstExpression = expression.expression || expression
    
    if (!name) {
      let maxNesting = 10
      while (!firstExpression.name && maxNesting--) {
        firstExpression = firstExpression.left
      }
      name = firstExpression.name
    }
    
    logger.debug(`Creating Cycle binding for '${name}' via interception`)
    
    // TODO: don't create toView when 'callSource' type
    
    const toViewObservers = new Set<Observer<string>>()
    
    const toViewObservable:Observable<any> = Observable.create(function (observer: Observer<any>) {
      // logger.debug('Creating toView binding observable for:', name)
      
      // Yield a single value and complete
      toViewObservers.add(observer)
      // Any cleanup logic might go here
      return function () {
        // logger.debug('disposed of toView observable for', name)
        toViewObservers.delete(observer)        
      }
    })

    binding.toViewObservable = toViewObservable
    binding.toViewObservers = toViewObservers
    context.aureliaToViewObservables.set(name, toViewObservable)
    
    let toViewSubscription: Subscription
    
    if (binding['updateTarget']) {
      let method = 'updateTarget'
      binding[`cycle-intercepted-${method}`] = binding[method]
      
      const updateBindingValueInView = binding[method].bind(binding);
      
      toViewSubscription = toViewObservable.subscribe(value => {
        // logger.debug('updating toView', name, value)
        updateBindingValueInView(value)
      }, error => logger.error(`Error in a toViewObservable binding for ${name}`))
      
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
          // if (value !== undefined) {
            logger.debug(`an initial value was seeded to the observable: ${name} = '${value}'`)
            toViewObserversNextAll(value)
          // }
        })
        // toViewObservers.forEach(observer => observer.next(value))
      }
      
      context.propertyViewSetters.set(name, toViewObserversNextAll)
    }
    
    let allChanges = toViewObservable
    
    if (binding['updateSource'] || binding['callSource']) {
      let fromViewObservers = new Set<Observer<string|{event; arguments}>>()
      
      const fromViewObservable:Observable<any> = Observable.create(function (observer: Observer<any>) {
        // logger.debug('Creating fromView binding observable for:', name)
        // Yield a single value and complete
        fromViewObservers.add(observer)
        // Any cleanup logic might go here
        return function () {
          // logger.debug('disposed of fromView observable for', name)
          fromViewObservers.delete(observer)
        }
      })
      
      binding.fromViewObservable = fromViewObservable
      binding.fromViewObservers = fromViewObservers
      context.aureliaFromViewObservables.set(name, fromViewObservable)
      
      if (binding['updateSource']) {
        let method = 'updateSource'
        binding[`cycle-intercepted-${method}`] = binding[method];
        // user input - we don't need to change the underlying ViewModel, 
        // since we don't plan on using it
        //
        // we seed the value as user input to the observable 
        
        binding[method] = (value) => {
          // logger.debug('you changed the value of', name, value)
          fromViewObservers.forEach(observer => observer.next(value))
        }
        
        fromViewObservable['_aureliaType'] = 'property'
        allChanges = Observable.merge(fromViewObservable, toViewObservable)
      }
      
      if (binding['callSource']) {
        let method = 'callSource'
        binding[`cycle-intercepted-${method}`] = binding[method]
        // triggers and delegates should be considered user input
        
        const args = firstExpression.args
        
        binding[method] = ($event) => {
          let evaluatedArgs = []
          for (let arg of args) {
            evaluatedArgs.push(arg.evaluate(binding.source, binding.lookupFunctions, true))
          }
          // logger.debug('you invoked a method', name, event, evaluatedArgs)
          fromViewObservers.forEach(observer => observer.next({ event, arguments: evaluatedArgs }))          
        }
        
        fromViewObservable['_aureliaType'] = 'action'
      }
    }
    
    if (binding['updateSource'] || binding['updateTarget']) {
      binding.allChangesObservable = 
        allChanges.subscribe(
          (value) => {
            // logger.debug('a value was set', name, value)
            context.aureliaViewValues.set(name, value)
          }, 
          (error) => logger.error(error.message), 
          () => {
            logger.debug(`completed allChangesObservable for ${name}`)
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
      binding[method] = binding[`cycle-intercepted-${method}`];
      binding[`cycle-intercepted-${method}`] = undefined;
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


/**
* Decorator: Specifies that Cycle should used in the decoratored ViewModel.
* [NOT USED AT THIS TIME]
*/
export function cycle(potentialTarget?: any): any {
  let deco = function(target) {
    console.log('cycle decorator', target)
    target.useCycle = true
  }

  return potentialTarget ? deco(potentialTarget) : deco;
}
