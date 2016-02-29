import {Observable, Observer, Subscription} from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
import Cycle from '../jspm_packages/npm/@cycle/core@7.0.0-rc1/lib/index'
import {makeAureliaDriver} from './aurelia-cycle'

import {autoinject, bindable} from 'aurelia-framework'
import {Welcome} from './welcome'

@autoinject
export class Counter {
  
  @bindable label;
  
  constructor(private _welcome: Welcome) {}
  bind() {
    Cycle.run(this.cycle, { 
      CounterView: makeAureliaDriver(this),
      WelcomeView: makeAureliaDriver(this._welcome) 
    })
    this.cycleStartedResolve()
  }
  
  cycle({ CounterView, WelcomeView }) {
    const value$: Observable<string> = CounterView
      .select('value')
      .startWith(0)

    return {
      // CounterView: Observable.combineLatest(value$, 
      //   (value) => ({
      //     value
      //   })
      // ),
      WelcomeView: Observable.combineLatest(value$, 
        (value) => ({
          counterValue: value
        })
      )
    }
  }
  
  
  propertyViewSetters = new Map<string, (value)=>void>();
  aureliaFromViewObservables = new Map<string, Observable<any>>();
  aureliaToViewObservables = new Map<string, Observable<any>>();
  aureliaViewValues = new Map<string, string>();
  
  cycleStartedResolve: ()=>void;
  cycleStarted = new Promise<void>((resolve) => this.cycleStartedResolve = resolve);
}
