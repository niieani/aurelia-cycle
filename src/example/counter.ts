import {Observable} from 'rxjs/Rx'
import {makeAureliaDriver, ViewSource} from '../index'

import {autoinject, bindable} from 'aurelia-framework'
import {Welcome} from './welcome'

@autoinject
export class Counter {
  @bindable label;
  
  constructor(private _welcome: Welcome) {}
  
  cycleDrivers = { 
    CounterView: makeAureliaDriver(this),
    WelcomeView: makeAureliaDriver(this._welcome) 
  }
  
  cycle({ CounterView, WelcomeView }:{ CounterView: ViewSource, WelcomeView: ViewSource }) {
    const value$: Observable<string> = CounterView
      .values('value')
      .startWith(0)

    return {
      CounterView: Observable.combineLatest(value$, 
        (value) => ({
          value
        })
      ),
      WelcomeView: Observable.combineLatest(value$, 
        (value) => ({
          counterValue: value
        })
      )
    }
  }
}
