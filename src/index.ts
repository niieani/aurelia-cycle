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

// TODO: make hot? subscriptions

// import * as TheLogManager from 'aurelia-logging'

// export { default as Cycle } from '@cycle/core/lib/index'
// export { Subject, Scheduler, Observable, Observer, Operator, Subscriber, Subscription, Symbol, AsyncSubject, ReplaySubject, BehaviorSubject, ConnectableObservable, Notification, EmptyError, ArgumentOutOfRangeError, ObjectUnsubscribedError, UnsubscriptionError } from 'rxjs/Rx'

const logger = LogManager.getLogger('aurelia-cycle')
// const logger = TheLogManager.getLogger('aurelia-cycle-new')


function triggerObservers(name:string, value: ViewValue, context) {
  const observers = context.observers.get(name) as Set<Observer<ViewValue>>
  if (observers)
    observers.forEach(observer => observer.next(value)) // maybe we need to add origin?
  else
    logger.error(`no observer set exists for ${name} cycle binding`)
}


// export class CycleSharedValue {
//   constructor(public observable, public observers: Set<Observer<any>>, public last: string) {}
  
//   next(value) {
//     this.observers.forEach(observer => observer.next(value))
//     this.last = value
//   }
// }

type ValueAndBinding<T> = { value: T, binding: Binding }

export class CycleShared<T> {
  public observers: Set<Observer<ValueAndBinding<T>>>;
  
  next(value: ValueAndBinding<T>) {
    this.observers.forEach(observer => observer.next(value))
  }
}
export class CycleSharedValue<T> extends CycleShared<T> {
  constructor(public observers: Set<Observer<ValueAndBinding<T>>>, public last: T) {
    super()
  }
  
  next(value) {
    this.last = value.value
    super.next(value)
  }
}
export class CycleSharedAction<T> extends CycleShared<T> {
  constructor(public observers: Set<Observer<ValueAndBinding<T>>>) {
    super()    
  }
  
  onTriggerReturn: any;
  private _args: Array<any>;
  
  getArgs(mergeWithEvaluated) {
    if (!this._args) return mergeWithEvaluated;
    
  }
}

export interface CycleSharedObservable<T> extends Observable<T> {
  _cycleShared: CycleSharedValue<T>;
}
export interface CycleSharedActionObservable<T> extends Observable<T> {
  _cycleShared: CycleSharedAction<T>;
}

export function changable<T>(initialValue?: T) {
  let observers = new Set<Observer<ValueAndBinding<T>>>()
  const observable = (Observable.create(function (observer: Observer<ValueAndBinding<T>>) {
    observers.add(observer)
    // Any cleanup logic might go here
    return function () {
      observers.delete(observer)
    }
  }) as Observable<T>)
  
  const sharedObservable = observable.publish().refCount() as CycleSharedObservable<T> //TODO: 
  
  sharedObservable._cycleShared = new CycleSharedValue(observers, initialValue)
  
  return sharedObservable
  
  // const cycleSharedValue = {
  //   next: (value) => {
  //     observers.forEach(observer => observer.next(value))
  //     cycleSharedValue.last = value
  //   },
  //   last: initialValue,
  //   observable
  // }
  
  // return cycleSharedValue
  
  // on context save the observer to trigger
  
  // or no observables, just a unique instance of an object
  // for binding we: cycleShare(item.thing)
  // which on updateTarget - saves the value into the object
  // and on updateSource/bind - sets the initialValue (?)
  // or maybe we use methods on both ends? 
  // thing.bind="item.thing"  # item.thing => is an instanceof CycleShared  
  // and then for usage: cycleSharedValue(thing)
  // which gets and sets the values inside of the instance (since the instance shoudn't be recreated)
  
}

function getOrCreateObservable(name: string, context, hasValue = true) {
  let observable = context.observables.get(name) as Observable<any> & ObservableTypeExtension
  if (!observable) {
    logger.debug('creating an observable for', name, name, context)
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
      )
      // // modify context to contain these properties so that getContextFor will find them
      // context[name] = undefined
    } else {
      observable._cycleType = 'action'
      // // modify context to contain these properties so that getContextFor will find them
      // context[name] = () => console.log('action', name, context)
    }
    
    // modify context to contain these properties so that getContextFor will find them
    if (!(name in context))
      context[name] = undefined
    
    context.observables.set(name, observable)
    context.observers.set(name, observers)
  }
  return observable
}

function removeObservableIfNoObservers(name, context) {
  // TODO: cleanup
}

function isCycleShareObservable(value: CycleSharedObservable<any>): boolean {
  return typeof value == 'object' && value._cycleShared instanceof CycleShared
}

function invokeAureliaBindingSetter(context: any, name: string, value: any) {
  // const previousValue = context.aureliaViewValues.get(name)
  const previousValue = context[name]
  
  if (previousValue === value) return
  
  if (isCycleShareObservable(previousValue)) {
    const cycleShared = (previousValue as CycleSharedObservable<any>)._cycleShared
    if (cycleShared.last === value) return
    if (isCycleShareObservable(value)) {
      logger.debug('new logic: note, replacing the stub observable with this one')
      context[name] = value
      return
    }
    cycleShared.next({ value, binding: undefined })
    return
  }
  
  // previous value different 
  // logger.debug(`setting ${name}: from '${previousValue}' to '${value}'`)
  
  // TODO: instead of always setting the binding value, 
  // we should intelligently compare to see if it's an array or map or set
  // and mutate accordingly to make use of Aurelia's diffing algos
  
  const observers = context.observers as Map<string, Observer<string>>
  const observer = observers.get(name)
  if (!observer) {
    throw new Error(`Cannot set '${name}' binding value, because it is never used`)
  }
  observer.forEach(observer => observer.next(value))
}

/*
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
*/

/**
 * we need to build a tree for the in/out of the cycle
 * it's not a dom tree, but a data tree
 */
export function makeAureliaDriver(context: any) {
  // logger.debug('requested to make aurelia driver for', context)
  
  const driverCreator: DriverFunction = function aureliaDriver(props$) {
    props$.subscribe((propData) => {
      context.cycleStarted.then(() => {
        Object.keys(propData).forEach(propName => {
          const newValue = propData[propName]
          invokeAureliaBindingSetter(context, propName, newValue)
        })
      })
    })
    
    const AureliaSource = {
      values: function values(bindingName: string) {
        return getOrCreateObservable(bindingName, context, true)
        // const observable = getAureliaObservableForBinding(context, bindingName)
        // if (!observable || observable._cycleType != 'value')
        //   throw new Error(`Cannot select a non-existent value binding: ${bindingName}`)
        // return observable
      },
      actions: function actions(bindingName: string) {
        return getOrCreateObservable(bindingName, context, false)
        // const observable = getAureliaObservableForBinding(context, bindingName)
        // if (!observable || observable._cycleType != 'action')
        //   throw new Error(`Cannot select a non-existent action binding: ${bindingName}`)
        // return observable
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

class CycleBindingAction {
  constructor(public name: string, public context, public args, public scope, public lookupFunctions) {}
}

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
  
  const callScopeConnect: Function = CallScope.prototype.connect
  CallScope.prototype.connect = function connect(binding: Binding & any, scope: Scope) {
    callScopeConnect.apply(this, arguments)
    
    // NEW LOGIC:
    if (this.name == 'cycle') {
      const observable = this.args[0].evaluate(scope, binding.lookupFunctions, true) as CycleSharedObservable<ValueAndBinding<any>>
      if (isCycleShareObservable(observable)) {
        logger.debug('new logic: subscribe')
                
        observable.filter(value => value.binding !== this).subscribe(
          (value) => {
            logger.debug('new logic: updating binding for', this.args[0].name, 'prev value', observable._cycleShared.last, 'new value', value)
            let bindingValue = binding.sourceExpression.evaluate(binding.source, binding.lookupFunctions)
            binding.updateTarget(bindingValue) // update the whole binding
          }, 
          (error) => logger.error(`binding error for ${name}`, error), 
          () => logger.debug(`observable for ${name} complete`)
        )
        // TODO: cleanup after unbound?
      } else {
        // TODO: if observable is null - create a new one, like for CycleAction!
        logger.error('the argument passed in to the binding is not a CycleObservable', observable)
      }
      return
    }
    
    // find closest cycle context
    const context = getContextFor('observables', scope, this.ancestor)
    
    if (this.name == 'cycleAction' || this.name == 'cycleValue') {
      const name = this.args[0].evaluate(scope, binding.lookupFunctions, true)
      
      if (this.name == 'cycleValue') {
        // console.log('we have a cycleValue connect!')
        const observable = getOrCreateObservable(name, context)
        
        observable.subscribe(
          (value) => {
            // this.updateTarget(value) // update CallScope value
            // if (binding.source) {
              // TODO: update targets after Cycle Started?
              let bindingValue = binding.sourceExpression.evaluate(binding.source, binding.lookupFunctions)
              binding.updateTarget(bindingValue) // update the whole binding
            // }
          }, 
          (error) => logger.error(`binding error for ${name}`, error), 
          () => logger.debug(`observable for ${name} complete`)
        )
        return
      }
      if (this.name == 'cycleAction') {
        console.log('setting mamma mia')
        // this is used to set the value of the binding to an anonymous method that executes it
        binding.updateTarget(new CycleBindingAction(name, context, Array.from(this.args), scope, binding.lookupFunctions))
      }
    }
  }
  
  // function findClosestCycleContext(scope: Scope) {
  //   // getContextFor()
  //   // scope.overrideContext.parentOverrideContext
  // }
  
  const callScopeConstructor: Function = CallScope.prototype.constructor
  CallScope.prototype.constructor = function() {
    callScopeConstructor.apply(this, arguments)
    this.isAssignable = true
  }
  
  CallScope.prototype.assign = function assign(scope: Scope, value: any, lookupFunctions: any): any {
    // NEW LOGIC:
    if (this.name == 'cycle') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('new logic: assign', value)
        observable._cycleShared.next({ binding: this, value })
      }
      return
    }
    
    let context = getContextFor(this.name, scope, this.ancestor)
    if (!context || typeof context.cycle != 'function' || this.name !== 'cycleValue' || this.args.length === 0) {
      throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
    
    // const context = scope.bindingContext
    const name = this.args[0].evaluate(scope, lookupFunctions, true)
    context = getContextFor(name, scope, this.ancestor)
    // logger.debug(context, 'will set', name, 'to', value)
    triggerObservers(name, value, context)
  }
  
  function evalArgsAndTrigger(name, context, args, scope, lookupFunctions, skipFirstArg = true) {
    // if (skipFirstArg) 
    //   argsList.shift()
    // const args = evalList(scope, argsList, lookupFunctions)
    const event = scope.overrideContext.$event
    logger.debug(context, 'event trigerred', name, args, event, this)
    triggerObservers(name, { event, arguments: args }, context)
  }
  
  const callScopeEvaluate: Function = CallScope.prototype.evaluate
  CallScope.prototype.evaluate = function evaluate(scope: Scope, lookupFunctions, mustEvaluate: boolean) {
    let context = getContextFor(this.name, scope, this.ancestor)
    
    // e.g. doSomething() where doSomething is a @bindable doSomething from another context;
    if (context[this.name] instanceof CycleBindingAction) {
      const cycleBindingAction = (context[this.name] as CycleBindingAction)
      
      const argsThis = evalList(scope, this.args, lookupFunctions)
      const argsParent = evalList(cycleBindingAction.scope, cycleBindingAction.args, cycleBindingAction.lookupFunctions)
      argsParent.shift()
      const args = argsParent.concat(argsThis)
      
      evalArgsAndTrigger(cycleBindingAction.name, cycleBindingAction.context, args, cycleBindingAction.scope, cycleBindingAction.lookupFunctions)
      
      // const event = scope.overrideContext.$event
      // logger.debug(context, 'event trigerred on external context', name, args, event, this)
      // triggerObservers(this.name, { event, arguments: args }, (context[name] as CycleBindingAction).context)
      return
    }
    
    // NEW LOGIC:
    if (this.name == 'cycle') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('new logic: retrieve last value')
        return observable._cycleShared.last
      }
    }
    if (this.name == 'cycleEvent') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedActionObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('new logic: trigger an action')
        const args = evalList(scope, this.args, lookupFunctions)
        args.shift()
        const event = scope.overrideContext.$event
        observable._cycleShared.next({ value: { event, arguments: observable._cycleShared.getArgs(args) }, binding: this })
        return observable._cycleShared.onTriggerReturn
      }
    }
    
    if (context && typeof context.cycle == 'function') {
      if (this.args.length > 0 && (this.name == 'cycleValue' || this.name == 'cycleAction')) {
        // const context = scope.bindingContext
        const name = this.args[0].evaluate(scope, lookupFunctions, true)
        context = getContextFor(name, scope, this.ancestor)
        if (this.name === 'cycleAction') {
          const argsThis = evalList(scope, this.args, lookupFunctions)
          argsThis.shift()
          evalArgsAndTrigger(name, context, argsThis, scope, lookupFunctions)
          
          // const args = evalList(scope, Array.from(this.args).slice(1), lookupFunctions)
          // const event = scope.overrideContext.$event
          // logger.debug(context, 'event trigerred', name, args, event, this)
          // triggerObservers(name, { event, arguments: args }, context)
          
          // NOTE: if this returns true, it can leave propagation
          return
        }
        // logger.debug(context, 'getting value to set in the view', name, this)
        
        // returning current value:
        if (name in context)
          return context[name]
      }
    }
    // if (!context || typeof context.cycle != 'function' || (this.name !== 'cycleValue' && this.name !== 'cycleAction') || this.args.length === 0) { //
    return callScopeEvaluate.apply(this, arguments)
    // }
  }
  
  // function findClosestCycleContext(scope: Scope) {
  // }
  
  CallScope.prototype.bind = function bind(binding: Binding & any, scope: Scope, lookupFunctions) {
    const expression = binding.sourceExpression // as Expression & { name:string, ancestor:any, args:Array<Expression>, _unbind:()=>void }

    // NEW LOGIC:
    if (expression.name == 'cycle' || expression.name == 'cycleEvent') {
      // TODO: delay this?
      const observable = expression.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (!observable) {
        const name = expression.args[0].name
        const context = getContextFor(name, scope, expression.ancestor)
        logger.debug('new logic: would create a changable observable for', expression.args[0], 'with args method like', () => evalList(scope, this.args, lookupFunctions), 'context', context)
        // TODO: lazy creation on first use ? store only args for first use?
        if (!context[name]) // TODO: if not undefined
          context[name] = changable() // create empty changable
      }
      // getOrCreateObservableNEWLOGIC(name, context, expression.name == 'cycle')
      return
    }

    if (expression.name == 'cycleValue' || expression.name == 'cycleAction') {
      const name = expression.args[0].evaluate(scope, lookupFunctions, true)
      const context = getContextFor(name, scope, expression.ancestor)
      // const context = getContextFor(expression.name, scope, expression.ancestor)
      // store the update method:
      const observable = getOrCreateObservable(name, context, expression.name == 'cycleValue')

      expression._unbind = () => removeObservableIfNoObservers(name, context)
    }
  }
  
  CallScope.prototype.unbind = function unbind(binding, scope: Scope) {
    const expression = binding.sourceExpression
    // const name = expression.name // act only if 'cycleValue'
    if (expression._unbind) { //name == 'cycleValue' || expression.name == 'cycleAction'
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
