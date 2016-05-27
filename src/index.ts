import Cycle from '@cycle/rxjs-run'
import {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject, Subscriber} from 'rxjs/Rx'
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom, autoinject, Container} from 'aurelia-framework';
import {ViewEngineHooks, View, Controller} from 'aurelia-templating'
import {ContextChanges, ChangeOrigin, ChangeType} from './basic-bindings'

export {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject} from 'rxjs/Rx'
export * from './basic-bindings'
const logger = LogManager.getLogger('aurelia-plugin-skeleton')

export function configure(frameworkConfig: FrameworkConfiguration) {
  const viewResources = frameworkConfig.aurelia.resources
  const diContainer = frameworkConfig.container
  
  const hooks = {
    beforeBind: function (view: View & {bindingContext; controller: Controller}) {
      if (view.controller !== null) {
        const context = view.controller.viewModel as any
        
        if (!context || typeof context.cycle !== 'function') return
        const count = context._cycleCount = (context._cycleCount || 0) + 1
    
        if (context._cycleCount > 1) {
          logger.error('would run the cycle more then once!', count)
          return
        }
    
        const preparedSources = context.cycleDrivers || {}
        const { drivers, onBind, onUnbind, dispose } = makeBindingDrivers(context, diContainer) //observerLocator, strategyLocator, signaler
        
        Object.assign(preparedSources, drivers)
        
        onBind()
        
        context._cycleOnUnbind = onUnbind
        
        const {run, sources, sinks} = Cycle(context.cycle.bind(context), preparedSources)
        const disposeFunction = run()
        
        const _cycleDispose = () => {
          dispose()
          disposeFunction()
        }
    
        context._cycleDispose = _cycleDispose
      }
      
    },
    beforeUnbind: function (view: View & {bindingContext: any; controller: Controller}) {
      if (view.controller !== null) {
        const context = view.controller.viewModel as any
        
        if (!context || typeof context._cycleDispose !== 'function') return
        
        context._cycleCount = context._cycleCount - 1
        
        context._cycleDispose()
        context._cycleOnUnbind()
        context._cycleDispose = undefined
        context._cycleOnUnbind = undefined
      }
    }
  } as ViewEngineHooks
  
  viewResources.registerViewEngineHooks(hooks)
}

export function makeBindingDrivers(context: any, diContainer: Container) {
  const drivers = {}
  
  // mega-observable with everything happening on the context
  let changes$: Subject<ContextChanges> = context.changes$ || (context.changes$ = new Subject<ContextChanges>())

  // TODO: use a defined Symbol instead of a property name
  // TODO: add bind hooks and remove post bind so that we can have multiple View instances of the same ViewModel
  
  const onBind = (function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      value: null, 
      type: ChangeType.Bind
    })
  }).bind(context)
  
  const onUnbind = (function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      value: null, 
      type: ChangeType.Unbind
    })
  }).bind(context)
  
  const dispose = (function() {
    if (this._postUnbindHooks)
      this._postUnbindHooks.forEach(hook => hook())
    this._postUnbindHooks = undefined
  }).bind(context)
  
  const disposeMethods = new Set<Function>()
  const driverCreators = context.constructor.cycleDriverCreators as Map<string, Function>
  
  if (driverCreators) {
    driverCreators.forEach((driverCreatorClass, propertyName) => {
      let driverCreatorInstance: DriverCreator = diContainer.get(driverCreatorClass)
      const { driverCreator, dispose } = driverCreatorInstance.makeDriver(context, propertyName, changes$)
      drivers[`${propertyName}$`] = driverCreator
      
      disposeMethods.add(dispose)
    })
  }
  
  return {
    drivers, onBind, onUnbind, dispose: () => {
      disposeMethods.forEach(d => d())
      dispose()
    }
  }
}


export interface DriverCreator {
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>): { driverCreator: DriverFunction, dispose: () => void }
}

export function defineDriverCreator(ctor: any, propertyName: string, driverCreator: Function) {
  if (!ctor.cycleDriverCreators)
    ctor.cycleDriverCreators = new Map()
  ctor.cycleDriverCreators.set(propertyName, driverCreator)
}
