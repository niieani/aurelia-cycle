import {CallScope, Scope, getContextFor, Binding, Expression} from 'aurelia-binding'
import {View} from 'aurelia-templating'
import {Observable, Observer, Subscription} from 'rxjs/Rx'
import Cycle from '@cycle/core/lib/index'
import rxjsAdapter from '@cycle/rxjs-adapter/lib/index'
import { DriverFunction } from '@cycle/base'
import {Aurelia, LogManager, FrameworkConfiguration} from 'aurelia-framework';

// for returning data to other cycles (like clicks on a delete button)
// it would be great to have a shared context
// actions / values should have { event, arguments, context }
// then there are an aggregate observables that contain data of all objects
// so you can have a SharedAureliaDriver
// Shared.select(TodoItem).actions('destroy')

// actually, with @bindable you could theoretically also bind action triggers
// so maybe it's not necesary to have a shared context after all? 

// import * as TheLogManager from 'aurelia-logging'

// export { default as Cycle } from '@cycle/core/lib/index'
// export { Subject, Scheduler, Observable, Observer, Operator, Subscriber, Subscription, Symbol, AsyncSubject, ReplaySubject, BehaviorSubject, ConnectableObservable, Notification, EmptyError, ArgumentOutOfRangeError, ObjectUnsubscribedError, UnsubscriptionError } from 'rxjs/Rx'

const logger = LogManager.getLogger('aurelia-cycle-new')
// const logger = TheLogManager.getLogger('aurelia-cycle-new')

export function configure(frameworkConfig: FrameworkConfiguration) {
  // const bindingBehaviorInstance = frameworkConfig.container.get(CycleBindingBehavior)
  // frameworkConfig.aurelia.resources.registerBindingBehavior('cycle', bindingBehaviorInstance) //new CycleBindingBehavior()
  
  // TODO: investigate:
  // frameworkConfig.aurelia.resources.registerViewEngineHooks({ 
  //   beforeCreate: ()=>{ logger.debug('before view create') }, 
  //   afterCreate: ()=>{ logger.debug('after view create') } 
  // })

  const originalBind:(scope)=>void = View.prototype.bind
  
  View.prototype.bind = function bind(context: any, overrideContext?: Object, _systemUpdate?: boolean): void {
    let sources
    // logger.debug('before bind')
    if (context && typeof context.cycle == 'function') {
      function getDefaultSources() {
        return { [context.constructor.name + 'View']: makeAureliaDriver(context) }
      }
      
      // logger.debug('sources', context, context.cycleDrivers, scope)
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
    // logger.debug('after bind')
    
    if (sources) {
      // const sources = context.cycleDrivers || { [context.constructor.name + 'View']: makeAureliaDriver(context) }
      
      Cycle.run(context.cycle.bind(context), sources)
      // seed initial values:
      context.cycleStartedResolve()
      // logger.debug('started post-binding for cycle hook', context)
    }
  }
  
  // const bindingBind: Function = Binding.prototype.bind
  // Binding.prototype.bind = function bind(source: Scope) {
  //   bindingBind.apply(this, arguments)
  //   console.log('binding', this)
  // }
  const callScopeConnect: Function = CallScope.prototype.connect
  CallScope.prototype.connect = function connect(binding: Binding & any, scope: Scope) {
    callScopeConnect.apply(this, arguments)
    console.log('connected', binding, scope, this)
    // binding.call()
    if (this.name == 'cycleValue') {
      console.log('we have a cycleValue connect!')
      const context = scope.bindingContext
      const name = this.args[0].evaluate(scope, binding.lookupFunctions, true)
      const observable = getOrCreateObservable(name, context)
      observable.subscribe(
        (value) => {
          // this.updateTarget(value) // update CallScope value
          let bindingValue = binding.sourceExpression.evaluate(binding.source, binding.lookupFunctions)
          binding.updateTarget(bindingValue) // update the whole binding
        }, 
        (error) => logger.error(`binding error for ${name}`, error), 
        () => logger.debug(`observable for ${name} complete`)
      )
      // setInterval(() => {
      //   let value = binding.sourceExpression.evaluate(binding.source, binding.lookupFunctions)
      //   binding.updateTarget(value)
      // }, 1000)
    }
    // binding.
    // let args = this.args;
    // let i = args.length;
    // while (i--) {
    //   args[i].connect(binding, scope);
    // }
    // todo: consider adding `binding.observeProperty(scope, this.name);`
  }
  
  const callScopeConstructor: Function = CallScope.prototype.constructor
  CallScope.prototype.constructor = function() {
    callScopeConstructor.apply(this, arguments)
    this.isAssignable = true
  }
  
  function triggerObservers(name:string, value: ViewValue, context) {
    const observers = context.observers.get(name) as Set<Observer<ViewValue>>
    if (observers)
      observers.forEach(observer => observer.next(value)) // maybe we need to add origin?
    else
      logger.error(`no observer set exists for ${name} cycle binding`)
  }
  
  CallScope.prototype.assign = function assign(scope: Scope, value: any, lookupFunctions: any): any {
    // if (!context.cycle) {
    const context = getContextFor(this.name, scope, this.ancestor)
    if (!context || typeof context.cycle != 'function' || this.name !== 'cycleValue' || this.args.length === 0) {
      throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
    // const context = scope.bindingContext
    const name = this.args[0].evaluate(scope, lookupFunctions, true)
    logger.debug(context, 'will set', name, 'to', value)
    triggerObservers(name, value, context)
  }
  
  const callScopeEvaluate: Function = CallScope.prototype.evaluate
  CallScope.prototype.evaluate = function evaluate(scope: Scope, lookupFunctions, mustEvaluate: boolean) {
    const context = getContextFor(this.name, scope, this.ancestor)
    if (!context || typeof context.cycle != 'function' || (this.name !== 'cycleValue' && this.name !== 'cycleAction') || this.args.length === 0) {
      return callScopeEvaluate.apply(this, arguments)
    }
    // const context = scope.bindingContext
    const name = this.args[0].evaluate(scope, lookupFunctions, true)
    if (this.name === 'cycleAction') {
      const args = evalList(scope, Array.from(this.args).slice(1), lookupFunctions)
      const event = scope.overrideContext.$event
      logger.debug(context, 'event trigerred', name, args, event, this)
      triggerObservers(name, { event, arguments: args }, context)
      // NOTE: if this returns true, it can leave propagation
      return
    }
    logger.debug(context, 'getting value to set in the view', name, this)
    // no it's own we shouldn't return anything;
    // instead we will use propertyViewSetters directly to set the value of this binding
    if (name in context)
      return context[name]
    // context.aureliaViewValues.get(name)
    // 'awesome'
    
    // let args = evalList(scope, this.args, lookupFunctions);
    // let func = getFunction(context, this.name, mustEvaluate);
    // if (func) {
    //   return func.apply(context, args);
    // }
    // return undefined;
  }
  
  function getOrCreateObservable(name: string, context, hasValue = true) {
    let observable = context.observables.get(name) as Observable<any> & ObservableTypeExtension
    if (!observable) {
      const observers = new Set<Observer<string>>()
      observable = Observable.create(function (observer: Observer<string>) {
        // logger.debug('Creating toView binding observable for:', name)
        observers.add(observer)
        // Any cleanup logic might go here
        return function () {
          // logger.debug('disposed of toView observable for', name)
          observers.delete(observer)
        }
      })
      
      if (hasValue) {
        observable._cycleType = 'value'
        const storeValueCacheSubscription: Subscription = observable.subscribe(
          value => context[name] = value
          // value => context.aureliaViewValues.set(name, value)
          // undefined, 
          // () => storeValueCacheSubscription.unsubscribe()
        )
      } else {
        observable._cycleType = 'action'        
      }
      
      context.observables.set(name, observable)
      context.observers.set(name, observers)
      // storeValueSubscription.
    }
    return observable
  }
  
  CallScope.prototype.bind = function bind(binding: Binding & any, scope: Scope, lookupFunctions) {
    const expression = binding.sourceExpression // as Expression & { name:string, ancestor:any, args:Array<Expression>, _unbind:()=>void }
    // const name = expression.name // act only if 'cycleValue'
    // console.log('binding', binding)
    if (expression.name == 'cycleValue' || expression.name == 'cycleAction') {
      const context = getContextFor(expression.name, scope, expression.ancestor)
      const name = expression.args[0].evaluate(scope, lookupFunctions, true)
      // store the update method:
      logger.debug('store the updateTarget for', name, context, binding)
      // setTimeout(() => binding.updateTarget('ho ho ho'), 2000)
      const observable = getOrCreateObservable(name, context, expression.name == 'cycleValue')
      // observable.subscribe(
      //   (value) => binding.updateTarget(value), 
      //   (error) => logger.error(`binding error for ${name}`, error), 
      //   () => logger.debug(`observable for ${name} complete`)
      // )
      
      // const propertyViewSetters = context.propertyViewSetters as Map<string, Function>
      // propertyViewSetters.set(name, binding.updateTarget.bind(binding))
      // expression._unbind = () => propertyViewSetters.delete(name)
    }
    
    // should we?
    // binding.targetObserver = { subscribe(){ }, unsubscribe() { } } 
  }
  
  CallScope.prototype.unbind = function unbind(binding, scope: Scope) {
    const expression = binding.sourceExpression
    // const name = expression.name // act only if 'cycleValue'
    if (expression.name == 'cycleValue') {
      expression._unbind()
      // const context = getContextFor(expression.name, scope, expression.ancestor)
      // const name = expression.args[0].evaluate(scope, lookupFunctions, true)
      // store the update method:
      // logger.debug('store the updateTarget for', name, context, binding.updateTarget)
    }
    
    // should we?
    // binding.targetObserver = { subscribe(){ }, unsubscribe() { } } 
  }
  
  
}

export type Action = { event: AnyEvent, arguments: Array<any> };
export type Value = string | number
export type ViewValue = Action | Value

// export type ViewObservable = Observable<string | number>;

export type ObservableTypeExtension = { _cycleType: 'action' | 'value' };

export type ActionObservable = Observable<Action> & ObservableTypeExtension;
export type ValueObservable = Observable<Value> & ObservableTypeExtension;
// export type ViewObservable = ActionObservable | ValueObservable;
export type ViewObservable = (Observable<Action> | Observable<Value>) & ObservableTypeExtension;
export type ViewObservableMap = Map<string, ViewObservable>;

// export type ViewObservableMap = Map<string, ViewObservable>;
export type AnyEvent = Event | FocusEvent | GamepadEvent | HashChangeEvent | KeyboardEvent | MessageEvent | MouseEvent | MouseWheelEvent | MSGestureEvent | MSManipulationEvent | MSMediaKeyMessageEvent | MSMediaKeyNeededEvent | MSSiteModeEvent | MutationEvent | NavigationCompletedEvent | NavigationEvent | NavigationEventWithReferrer | OfflineAudioCompletionEvent | PageTransitionEvent | PermissionRequestedEvent | PointerEvent | PopStateEvent | ProgressEvent | ScriptNotifyEvent | StorageEvent | SVGZoomEvent | TextEvent | TouchEvent | TrackEvent | TransitionEvent | UIEvent | UnviewableContentIdentifiedEvent | WebGLContextEvent | WheelEvent;

export type ViewSource = { values: (bindingName: string) => ValueObservable, actions: (bindingName: string) => ActionObservable };


//////////////////////////

function invokeAureliaBindingSetter(context: any, name: string, value: string) {
  // const previousValue = context.aureliaViewValues.get(name)
  const previousValue = context[name]
  
  if (previousValue !== value) {
    // previous value different 
    // logger.debug(`setting ${name}: from '${previousValue}' to '${value}'`)
    
    // TODO: instead of always setting the binding value, 
    // we should intelligently compare to see if it's an array or map or set
    // and mutate accordingly to make use of Aurelia's diffing algos
    
    // const propertyViewSetters: PropertyViewSetterMap = context.propertyViewSetters
    const observers = context.observers as Map<string, Observer<string>>
    observers.get(name).forEach(observer => observer.next(value))
    // const setter = propertyViewSetters.get(name)
    // if (setter)
    //   setter(value)
    // else
    //   logger.error(`the binding (${name}) is not a two-way binding and you cannot set it!`)
  }
  // else {
  //   logger.debug('previous value equal, not setting', propName, previousValue, newValue)
  // }
}

function getAureliaObservableForBinding(context: any, name: string) {
  const observables: ViewObservableMap = context.observables
  return observables.get(name)
  // const aureliaFromViewObservables: FromViewObservableMap = context.aureliaFromViewObservables
  // const aureliaToViewObservables: ViewObservableMap = context.aureliaToViewObservables
  
  // let fromView = aureliaFromViewObservables.get(name)
  // let toView = aureliaToViewObservables.get(name)
  
  // const returnObservable: FromViewObservable = toView && fromView ? Observable.merge<FromViewObservable, FromViewObservable>(fromView, toView) : toView as any || fromView
  
  // returnObservable._cycleType = fromView ? fromView._cycleType : 'value'
  // return returnObservable
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
        if (!observable || observable._cycleType != 'value')
          throw new Error(`Cannot select a non-existent value binding ${bindingName}`)
        return observable
      },
      actions: function actions(bindingName: string) {
        const observable = getAureliaObservableForBinding(context, bindingName)
        if (!observable || observable._cycleType != 'action')
          throw new Error(`Cannot select a non-existent action binding ${bindingName}`)
        return observable
      },
    }
    return AureliaSource
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  
  // aurelia specific
  // if (!context.propertyViewSetters)
  //   context.propertyViewSetters = new Map<string, (value)=>void>()

  // if (!context.aureliaFromViewObservables)
  //   context.aureliaFromViewObservables = new Map<string, Observable<any>>()

  // if (!context.aureliaToViewObservables)
  //   context.aureliaToViewObservables = new Map<string, Observable<any>>()

  // if (!context.aureliaViewValues)
  //   context.aureliaViewValues = new Map<string, string>()
  
  if (!context.observables)
    context.observables = new Map<string, Observable<any>>()
    
  if (!context.observers)
    context.observers = new Map<string, Observer<any>>()
  
  if (!context.cycleStarted || !context.cycleStartedResolve)
    context.cycleStarted = new Promise<void>((resolve) => context.cycleStartedResolve = resolve)
  
  return driverCreator
}





//////////////////////////

// FROM https://github.com/aurelia/binding/blob/master/src/ast.js

var evalListCache = [[],[0],[0,0],[0,0,0],[0,0,0,0],[0,0,0,0,0]];
/// Evaluate the [list] in context of the [scope].
function evalList(scope, list, lookupFunctions) {
  var length = list.length,
      cacheLength, i;

  for (cacheLength = evalListCache.length; cacheLength <= length; ++cacheLength) {
    evalListCache.push([]);
  }

  var result = evalListCache[length];

  for (i = 0; i < length; ++i) {
    result[i] = list[i].evaluate(scope, lookupFunctions);
  }

  return result;
}
