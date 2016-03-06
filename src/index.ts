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
  constructor(public observers: Set<Observer<ValueAndBinding<T>>>, public argsMethod: () => Array<any>) {
    super()    
  }
  
  onTriggerReturn: any = undefined;
  
  getArgs(mergeWith = []) {
    if (!this.argsMethod) return mergeWith;
    const args = this.argsMethod()
    args.shift()
    return args.concat(mergeWith)
  }
}

export interface CycleSharedObservable<T> extends Observable<T> {
  _cycleShared: CycleSharedValue<T>;
}
export interface CycleSharedActionObservable<T> extends Observable<T> {
  _cycleShared: CycleSharedAction<T>;
}

export function changableAction<T>(argsMethod: ()=>Array<any>) {
    let observers = new Set<Observer<ValueAndBinding<T>>>()
    const observable = (Observable.create(function (observer: Observer<ValueAndBinding<T>>) {
      observers.add(observer)
      // Any cleanup logic might go here
      return function () {
        observers.delete(observer)
      }
    }) as Observable<T>)
    
    const sharedObservable = observable.publish().refCount() as CycleSharedActionObservable<T> //TODO: 
    
    sharedObservable._cycleShared = new CycleSharedAction(observers, argsMethod)
    
    return sharedObservable
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

function isCycleShareObservable(value: CycleSharedObservable<any> | CycleSharedActionObservable<any>): boolean {
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
}

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
        const observable = context[bindingName] as CycleSharedActionObservable<ValueAndBinding<any>>
        if (observable._cycleShared instanceof CycleSharedValue) {
          return observable.map(valueAndBinding => valueAndBinding.value)
        }
        return null
      },
      actions: function actions(bindingName: string) {
        const observable = context[bindingName] as CycleSharedActionObservable<any>
        if (observable._cycleShared instanceof CycleSharedAction) {
          return observable
        }
        return null
      },
    }
    return AureliaSource
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  
  if (!context.cycleStarted || !context.cycleStartedResolve)
    context.cycleStarted = new Promise<void>((resolve) => context.cycleStartedResolve = resolve)
  
  return driverCreator
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
    
    if (sources) {
      Cycle.run(context.cycle.bind(context), sources)
      // seed initial values:
      context.cycleStartedResolve()
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
    if (this.name == 'cycleAction') {
      const observable = this.args[0].evaluate(scope, binding.lookupFunctions, true) as CycleSharedActionObservable<any>
      if (!observable) {
        console.log('new logic: setting mamma mia cycleAction')
        binding.updateTarget( //this.args[0]
          changableAction(() => {
            const argsToEval = Array.from(this.args)
            argsToEval.shift()
            return evalList(scope, argsToEval, binding.lookupFunctions)
          })
        )
      }
      return
      // this is used to set the value of the binding to a metadata object that expresses it
      // binding.updateTarget(
      //   changableAction(() => {
      //     const argsToEval = Array.from(this.args)
      //     argsToEval.shift()
      //     return evalList(scope, argsToEval, binding.lookupFunctions)
      //   })
      //   // new CycleBindingAction(name, context, Array.from(this.args), scope, binding.lookupFunctions)
      // )
    }
  }
  
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
    
    throw new Error(`Binding expression "${this}" cannot be assigned to.`)
  }
  
  const callScopeEvaluate: Function = CallScope.prototype.evaluate
  CallScope.prototype.evaluate = function evaluate(scope: Scope, lookupFunctions, mustEvaluate: boolean) {

    // NEW LOGIC:
    if (this.name == 'cycle') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('new logic: retrieve last value')
        return observable._cycleShared.last
      }
    }
    if (this.name == 'cycleAction') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedActionObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('new logic: trigger an action')
        const argsToEval = Array.from(this.args)
        argsToEval.shift()
        const args = evalList(scope, argsToEval, lookupFunctions)
        const event = scope.overrideContext.$event
        observable._cycleShared.next({ event, arguments: observable._cycleShared.getArgs(args) })
        // observable._cycleShared.next({ value: { event, arguments: observable._cycleShared.getArgs(args) }, binding: this })
        // return
        return observable._cycleShared.onTriggerReturn
      }
    }
    return callScopeEvaluate.apply(this, arguments)
  }
  
  CallScope.prototype.bind = function bind(binding: Binding & any, scope: Scope, lookupFunctions) {
    const expression = binding.sourceExpression // as Expression & { name:string, ancestor:any, args:Array<Expression>, _unbind:()=>void }

    // NEW LOGIC:
    if (expression.name == 'cycle' || expression.name == 'cycleAction') {
      // TODO: delay this?
      const observable = expression.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (!observable) {
        const name = expression.args[0].name
        const context = getContextFor(name, scope, expression.ancestor)
        
        // TODO: lazy creation on first use ? store only args for first use?
        if (!context[name]) // TODO: if not undefined
          if (expression.name == 'cycle') {
            logger.debug('new logic: will create a changable VALUE observable for', expression.args[0].name, 'context', context)
            context[name] = changable() // create empty changable
          } else {
            logger.debug('new logic: will create a changable EVENT observable for', expression.args[0].name, 'with args method like', () => evalList(scope, this.args, lookupFunctions), 'context', context)
            context[name] = changableAction(() => {
              const argsToEval = Array.from(this.args)
              argsToEval.shift()
              return evalList(scope, argsToEval, lookupFunctions)
            }) // create changableAction          
          }
      }
      return
    }
  }
  
  CallScope.prototype.unbind = function unbind(binding, scope: Scope) {
    const expression = binding.sourceExpression
    // const name = expression.name // act only if 'cycleValue'
    // if (expression._unbind) {
    //   expression._unbind()
    // }
    
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
