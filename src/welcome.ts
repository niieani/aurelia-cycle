//import {computedFrom} from 'aurelia-framework';

import {Observable, Observer, Subscription} from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
import Cycle from '../jspm_packages/npm/@cycle/core@7.0.0-rc1/lib/index'
import {makeAureliaDriver} from './aurelia-cycle'

import {child} from 'aurelia-framework'

export class Welcome {
  propertyViewSetters = new Map<string, (value)=>void>();
  aureliaFromViewObservables = new Map<string, Observable<any>>();
  aureliaToViewObservables = new Map<string, Observable<any>>();
  aureliaViewValues = new Map<string, string>();
  
  cycleStartedResolve: ()=>void;
  cycleStarted = new Promise<void>((resolve) => this.cycleStartedResolve = resolve);
  
  @child('counter') counter;
  
  bind() {
    // console.log('setters', this.propertyViewSetters)
    // console.log('observables', this.aureliaFromViewObservables)
    
    const sources = { WelcomeView: makeAureliaDriver(this) }
    Cycle.run(this.cycle, sources)
    
    // seed initial values:
    this.cycleStartedResolve()
  }
  
  attached() {
    console.log('counter', this.counter)
  }
  
  // constructor() {
  // }
  
  // created() {
  // }
  
  cycle({ WelcomeView }:{WelcomeView:{ select:(selector)=>Observable<any>, events:(selector)=>Observable<any> }}) {
    const add$ = WelcomeView
      .events('add_click') // TODO: rename events to actions
      // .do(ev => console.log(ev))
      .map(ev => 1)

    const count$ = add$
      .startWith(0)
      .scan<number>((total, change) => total + change)

    const name$ = WelcomeView
      .select('firstName')
      // .startWith('')
      .map(input => `${input} awesome`)
      // .do(ev => console.log(ev))

    const mouse$ = Observable
      .fromEvent<MouseEvent>(document, 'mousemove')
      .startWith({x: 0, y: 0} as MouseEvent)
      
    const counterValue$ = WelcomeView
      .select('counterValue')
      .startWith(0)

    return {
      WelcomeView: Observable.combineLatest(
        count$, name$, counterValue$, mouse$, 
        (count, name, counter, mouse) => ({ 
          countText: `${count} : ${name} : ${counter}`,
          mouseX: mouse.x,
          counterLabel: mouse.y
        })
      )
    }
  }
}
