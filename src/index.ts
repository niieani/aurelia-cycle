import {CallScope, Scope, getContextFor, Binding, Expression} from 'aurelia-binding'
import {View} from 'aurelia-templating'
import {Observable, Observer, Subscription, ReplaySubject, BehaviorSubject, Subject} from 'rxjs/Rx'
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
  
  getArgs() {
    if (!this.argsMethod) return [];
    return this.argsMethod()
  }
  
  next(event, args) {
    const metadata = { event, arguments: args, originArguments: this.getArgs() }
    logger.debug('triggered action with metadata', metadata)
    super.next(metadata)
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
  // const observable = (Observable.create(function (observer: Observer<ValueAndBinding<T>>) {
  //   observers.add(observer)
  //   // Any cleanup logic might go here
  //   return function () {
  //     observers.delete(observer)
  //   }
  // }) as Observable<T>)
  
  const observable = new Subject() //as BehaviorSubject<any>
  observers.add(observable) // TODO: refactor
  
  const sharedObservable = observable as CycleSharedActionObservable<T> //.publish().refCount()
  
  sharedObservable._cycleShared = new CycleSharedAction(observers, argsMethod)
  
  return sharedObservable
}

export function changable<T>(initialValue?: T) {
  let observers = new Set<Observer<ValueAndBinding<T>>>()
  
  // const observable = new BehaviorSubject(initialValue) //as BehaviorSubject<any>
  const observable = new ReplaySubject(1) //as BehaviorSubject<any>
  if (initialValue !== undefined)
    observable.next(initialValue)
  
  observers.add(observable) // TODO: refactor
  
  /*
  const observable = (Observable.create(function (observer: Observer<ValueAndBinding<T>>) {
    observers.add(observer)
    // Any cleanup logic might go here
    return function () {
      observers.delete(observer)
    }
  }) as Observable<T>)
  const sharedObservable = observable.publish().refCount() as CycleSharedObservable<T> //TODO: 
  */
  const sharedObservable = observable as CycleSharedObservable<T>
  
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

export function isolateProperties(object) {
  const bindableObject = {}
  Object.getOwnPropertyNames(object).forEach(
    property => bindableObject[property] = changable(object[property])
  )
  console.log('bindable object', object, '=', bindableObject)
  return bindableObject
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
      logger.debug('note, replacing the stub observable with this one')
      context[name] = value
      return
    }
    cycleShared.next({ value, binding: undefined })
    return
  } else {
    logger.error(`[AureliaBindingSetter] no observable ${name} exists at `, context, 'when trying to set', value)    
  }
}

/**
 * we need to build a tree for the in/out of the cycle
 * it's not a dom tree, but a data tree
 */
export function makeAureliaDriver(context: any) {
  // logger.debug('requested to make aurelia driver for', context)
  let subscription 
  const driverCreator: DriverFunction = function aureliaDriver(props$) {
    subscription = props$.subscribe((propData) => {
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
        if (!observable) {
          throw new Error(`No binding is set to observe '${bindingName}' in this context.'`)
        }
        if (observable._cycleShared instanceof CycleSharedValue) {
          return observable.map(valueAndBinding => valueAndBinding.value)
        }
        return null
      },
      actions: function actions(bindingName: string) {
        let observable = context[bindingName] as CycleSharedActionObservable<any>
        if (!observable) {
          // when in a loop this won't be there!
          // so let's set a stub instead and modify its ARGS method once it's bound
          // throw new Error(`No binding is set to trigger '${bindingName}' in this context.'`)
          context[bindingName] = observable = changableAction()
        }
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
  
  // TODO: when UNBIND: subscription.unsubscribe()
  
  return driverCreator
}

export function configure(frameworkConfig: FrameworkConfiguration) {
  // const bindingBehaviorInstance = frameworkConfig.container.get(CycleBindingBehavior)
  // frameworkConfig.aurelia.resources.registerBindingBehavior('cycleValue', bindingBehaviorInstance) //new CycleBindingBehavior()
  
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
  
  /**
   * this happens when we want to subscribe the binding to outside changes
   */
  const callScopeConnect: Function = CallScope.prototype.connect
  CallScope.prototype.connect = function connect(binding: Binding & any, scope: Scope) {
    callScopeConnect.apply(this, arguments)
    
    if (this.name == 'cycleValueTest' || this.name == 'cycleActionTest') {
      logger.debug(`[connect] [${this.name}]`, this.args[0].name, this, binding, scope, 'value of target', this.args[0].evaluate(scope, binding.lookupFunctions, true))      
      return
    }
    
    // NEW LOGIC:
    if (this.name == 'cycleValue') {
      logger.debug('[connect] start connect for VALUE:', this.args[0].name)      
      let observable = this.args[0].evaluate(scope, binding.lookupFunctions, true) as CycleSharedObservable<ValueAndBinding<any>>

      // if (!observable) {
        // TODO: if observable is null - create a new one
        // const name = this.args[0].name
        // const context = getContextFor(name, scope, binding.sourceExpression.ancestor)
      
        // if (!context[name]) { // TODO: if not undefined
        //   logger.debug('[connect] will create a changable VALUE observable for', name, 'context', context)
        //   observable = context[name] = changable<ValueAndBinding<any>>() // create empty changable
        // }
      // }
      
      if (isCycleShareObservable(observable)) {
        logger.debug('[connect] will subscribe to', this.args[0].name)
                
        const subscription = observable.filter(value => value.binding !== this).subscribe(
          (value) => {
            const source = binding.source || scope
            // if (value.binding && value.binding._destroyed) { // || binding._destroyed || !source || !source.bindingContext
            if (!source || !source.bindingContext) { // || binding._destroyed || !source || !source.bindingContext
              logger.error('[connect-subscription] binding or scope already destroyed!', this.args[0].name, 'new value', value, binding, 'this', this)
              subscription.unsubscribe()
              return
            }
            logger.debug('[connect-subscription] updating binding for', this.args[0].name, 'prev value', observable._cycleShared.last, 'new value', value, 'source', source, scope, this)
            // try {
            const bindingValue = binding.sourceExpression.evaluate(source, binding.lookupFunctions)
            binding.updateTarget(bindingValue) // update the whole binding
            // } catch (err) {
            //   logger.error('[connect-subscription] binding or scope already destroyed?', this.args[0].name, 'new value', value, binding)
            // }
          }, 
          (error) => logger.error(`binding error for ${name}`, error), 
          () => logger.debug(`[connect-subscription] observable for ${name} complete`)
        )
        this._cycleSubscription = subscription
        // TODO: cleanup after unbound?
      } else {
        logger.error('[connect] the argument passed in to the binding is not a CycleObservable', observable)
      }
      return
    }
    /*
    if (this.name == 'cycleAction') {
      logger.debug('[connect] start connect for ACTION:', this.args[0].name)      
      const observable = this.args[0].evaluate(scope, binding.lookupFunctions, true) as CycleSharedActionObservable<any>
      if (!observable) {
        console.log('[connect] setting mamma mia cycleAction for', this.args[0].name)
        binding.updateTarget( //this.args[0]
          changableAction(() => {
            const argsToEval = Array.from(this.args)
            argsToEval.shift()
            return evalList(scope, argsToEval, binding.lookupFunctions)
          })
        )
      } else {
        console.log('[connect] mamma mia cycleAction should have already been set for', this.args[0].name)        
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
    */
  }
  
  const callScopeConstructor: Function = CallScope.prototype.constructor
  CallScope.prototype.constructor = function() {
    callScopeConstructor.apply(this, arguments)
    logger.debug('[constructor]')    
    this.isAssignable = true
  }
  
  /**
   * updates the value on the context and any observers that might be listening
   */
  CallScope.prototype.assign = function assign(scope: Scope, value: any, lookupFunctions: any): any {
    
    if (this.name == 'cycleValueTest' || this.name == 'cycleActionTest') {
      logger.debug(`[assign] [${this.name}]`, this.args[0].name, '=', value, this, scope, 'value of target', this.args[0].evaluate(scope, lookupFunctions, true))      
      return
    }
    
    // NEW LOGIC:
    if (this.name == 'cycleValue') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('[assign]', this.args[0].name, value)
        observable._cycleShared.next({ binding: this, value })
      } else {
        logger.error('[assign] trying to set a value but no underlying observable exists for:', this.args[0].name)        
      }
      return
    }
    
    throw new Error(`Binding expression "${this}" cannot be assigned to.`)
  }
  
  const callScopeEvaluate: Function = CallScope.prototype.evaluate
  CallScope.prototype.evaluate = function evaluate(scope: Scope, lookupFunctions, mustEvaluate: boolean) {

    if (this.name == 'cycleValueTest' || this.name == 'cycleActionTest') {
      logger.debug(`[evaluate] [${this.name}]`, this.args[0].name, this, scope, 'value of target', this.args[0].evaluate(scope, lookupFunctions, true))      
      return
    }
    
    // NEW LOGIC:
    if (this.name == 'cycleValue') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (isCycleShareObservable(observable)) {
        logger.debug('[evaluate] retrieve last value of:', this.args[0].name)
        return observable._cycleShared.last
      } else {
        logger.error('[evaluate] trying to get a value but no underlying observable exists for:', this.args[0].name)
      }
      return
    }
    if (this.name == 'cycleAction') {
      const observable = this.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedActionObservable<any>
      if (isCycleShareObservable(observable)) {
        const event = scope.overrideContext.$event
        if (!event) {
          // this simply means it was not an action that was triggered, 
          // but that we are binding TO the action, and the system wants its value
          // it would be safer to do this explicitly, i.e.
          // cycleActionShare(action, 'param')
          // instead of assuming the person is binding and not evaluating
          return observable
        }
        const argsToEval = Array.from(this.args)
        argsToEval.shift()
        const args = argsToEval.map(arg => arg.evaluate(scope, lookupFunctions))
        // const args = evalList(scope, argsToEval, lookupFunctions)
        // TODO: make originalArguments and arguments separate
        logger.debug('[evaluate] trigger an action of:', this.args[0].name, {event, args})        
        observable._cycleShared.next(event, args)
        return observable._cycleShared.onTriggerReturn
      } else {
        logger.error('[evaluate] trying to trigger an action but no underlying observable exists:', this.args[0].name)
      }
      return
    }
    return callScopeEvaluate.apply(this, arguments)
  }
  
  let globalCount = 0
  
  CallScope.prototype.bind = function bind(binding: Binding & any, scope: Scope, lookupFunctions) {

    if (this.name == 'cycleValueTest' || this.name == 'cycleActionTest') {
      let valueOfTarget = this.args[0].evaluate(scope, lookupFunctions, true)
      if (valueOfTarget === undefined) {
        this.args[0].assign(scope, `[${this.name}] count:${++globalCount}`)
        valueOfTarget = this.args[0].evaluate(scope, lookupFunctions, true)
      }
      logger.debug(`[bind] [${this.name}]`, this.args[0].name, this, binding, scope, 'value of target', valueOfTarget)
      return
    }
    
    if (this.name == 'cycleValue' || this.name == 'cycleAction') {
      let valueOfTarget = this.args[0].evaluate(scope, lookupFunctions, true)
      const getArgs = () => {
        if (!scope.bindingContext) {
          logger.error(`[bind-getargs] sorry, can't get args when no bindingContext exists`)
          return []
        }
        const argsToEval = Array.from(this.args)
        argsToEval.shift()
        return evalList(scope, argsToEval, lookupFunctions)
      }
      if (valueOfTarget === undefined) {
        let newChangable
        if (this.name == 'cycleValue') {
          logger.debug('[bind] will create a changable VALUE observable for', this.args[0].name)
          newChangable = changable() // create empty changable
        } else {
          logger.debug('[bind] will create a changable EVENT observable for', this.args[0].name, 'with args method like', () => evalList(scope, this.args, lookupFunctions))
          newChangable = changableAction(getArgs) // create changableAction          
        }
        this.args[0].assign(scope, newChangable)
        valueOfTarget = this.args[0].evaluate(scope, lookupFunctions, true)
      }
      if (isCycleShareObservable(valueOfTarget) && valueOfTarget._cycleShared instanceof CycleSharedAction && !valueOfTarget._cycleShared.argsMethod) {
        // in case we pre-created the observable in the cycle()
        // this happens when binding to a value in a different context
        // since bind() is ready, cycle runs, but no CycleObservable is in context
        valueOfTarget._cycleShared.argsMethod = getArgs
      }
      logger.debug(`[bind] [${this.name}]`, this.args[0].name, this, binding, scope, 'value of target', valueOfTarget)
      return
    }
    /*
    const expression = binding.sourceExpression // as Expression & { name:string, ancestor:any, args:Array<Expression>, _unbind:()=>void }

    // NEW LOGIC:
    if (expression.name == 'cycleValue' || expression.name == 'cycleAction') {
      logger.debug('[bind] start bind for', expression.args[0].name)
      // TODO: delay this?
      const observable = expression.args[0].evaluate(scope, lookupFunctions, true) as CycleSharedObservable<any>
      if (!observable) {
        const name = expression.args[0].name
        const context = getContextFor(name, scope, expression.ancestor)
        
        // TODO: lazy creation on first use ? store only args for first use?
        if (!context[name]) // TODO: if not undefined
          if (expression.name == 'cycleValue') {
            logger.debug('[bind] will create a changable VALUE observable for', expression.args[0].name, 'context', context)
            context[name] = changable() // create empty changable
          } else {
            logger.debug('[bind] will create a changable EVENT observable for', expression.args[0].name, 'with args method like', () => evalList(scope, this.args, lookupFunctions), 'context', context)
            context[name] = changableAction(() => {
              const argsToEval = Array.from(this.args)
              argsToEval.shift()
              return evalList(scope, argsToEval, lookupFunctions)
            }) // create changableAction          
          }
      }
      return
    }
    */
  }
  
  CallScope.prototype.unbind = function unbind(binding, scope: Scope) {
    
    if (this.name == 'cycleValue' || this.name == 'cycleAction') {
      // logger.debug(`[unbind] [${this.name}]`, this.args[0].name, this, binding, scope)
      
      if (this._cycleSubscription) {
        logger.debug(`[unbind] [${this.name}] unsubscribing`, this.args[0].name, this, binding, scope, new Date())
        
        // TODO: this doesn't work. why?! perhaps we need to hook the binding itself?
        this._cycleSubscription.unsubscribe()
        this._cycleSubscription = undefined
        
        // this._destroyed = true
      }
      
      return
    }
    
    const expression = binding.sourceExpression
    // const name = expression.name // act only if 'cycleValue'
    // if (expression._unbind) {
    //   expression._unbind()
    // }
    
    // should we?
    // binding.targetObserver = { subscribe(){ }, unsubscribe() { } } 
  }
  
}

export type Action = { event: AnyEvent, arguments: Array<any>, originArguments: Array<any> };
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
