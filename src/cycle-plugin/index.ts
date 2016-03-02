import {Parser} from 'aurelia-binding';
import {Controller, HtmlBehaviorResource, BehaviorInstruction, View} from 'aurelia-templating';
import {Observable, Observer, Subscription} from '../../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
import Cycle from '../../jspm_packages/npm/@cycle/core@7.0.0-rc1/lib/index'
import {makeAureliaDriver} from '../aurelia-cycle'

export function configure(frameworkConfig) {
  // override the parse method.
  // console.log(arguments)
  // let viewController = frameworkConfig.container.get(Controller);
  // console.log(viewController)
  // console.log(Controller)
  // parser.parse = parse;
  
  // constructor(behavior: HtmlBehaviorResource, instruction: BehaviorInstruction, viewModel: Object) {
    
  // }
  // Controller.prototype.constructor
  
  
  // const originalConstructor:(behavior: HtmlBehaviorResource, instruction: BehaviorInstruction, viewModel: Object)=>void = Controller.prototype.constructor
  // Controller.prototype.constructor = function constructor(behavior: HtmlBehaviorResource, instruction: BehaviorInstruction, viewModel: Object) {
  //   originalBind.apply(this, arguments)
  //   console.log('binding constructor', arguments)
  // }
  
  
  // const originalCreated:(view: View)=>void = Controller.prototype.created
  // Controller.prototype.created = function constructor(view) {
  //   originalCreated.apply(this, arguments)
    
  //   const context = view.bindingContext
    
  //   console.log('created', view, context, context ? typeof context.cycle : null)
    
  //   // if (context.constructor.prototype.cycle) {
  //   if (context && typeof context.cycle == 'function') {
      
  //     context.propertyViewSetters = new Map<string, (value)=>void>();
  //     context.aureliaFromViewObservables = new Map<string, Observable<any>>();
  //     context.aureliaToViewObservables = new Map<string, Observable<any>>();
  //     context.aureliaViewValues = new Map<string, string>();
      
  //     //context.cycleStartedResolve: ()=>void;
  //     context.cycleStarted = new Promise<void>((resolve) => context.cycleStartedResolve = resolve);
      
  //     console.log('binding for cycle created', arguments)
  //   }
  // }
  
  const originalEnsurePropertiesDefined = HtmlBehaviorResource.prototype._ensurePropertiesDefined
  HtmlBehaviorResource.prototype._ensurePropertiesDefined = function _ensurePropertiesDefined(instance: Object, lookup: Object) {
    console.log('HtmlBehaviorResource', instance, lookup, this, this.properties)
    originalEnsurePropertiesDefined.apply(this, arguments)    
  }
  
  const originalBind:(scope: View)=>void = Controller.prototype.bind
  Controller.prototype.bind = function bind(scope) {
    const context = scope.bindingContext
    // console.log('bind context', context)
    /*
    // if (context.constructor.prototype.cycle) {
    if (context && typeof context.cycle == 'function') {
      
      context.propertyViewSetters = new Map<string, (value)=>void>();
      context.aureliaFromViewObservables = new Map<string, Observable<any>>();
      context.aureliaToViewObservables = new Map<string, Observable<any>>();
      context.aureliaViewValues = new Map<string, string>();
      
      //context.cycleStartedResolve: ()=>void;
      context.cycleStarted = new Promise<void>((resolve) => context.cycleStartedResolve = resolve);
      
      console.log('pre-binding for cycle setup', arguments)
    }
    */
    originalBind.apply(this, arguments)
    
    
    // console.log('bind', context, context ? typeof context.cycle : null)
    
    if (context && typeof context.cycle == 'function') {
      Cycle.run(context.cycle.bind(context), context.cycleSources || { [context.constructor.name + View]: makeAureliaDriver(context) })
      // seed initial values:
      context.cycleStartedResolve()
      console.log('post-binding for cycle hook', arguments)
    }
  }
}
