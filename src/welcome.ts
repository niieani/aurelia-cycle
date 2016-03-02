import {Observable, Observer, Subscription} from '../jspm_packages/npm/rxjs@5.0.0-beta.2/Rx'
import {makeAureliaDriver, ViewSource} from './cycle-plugin/index'

export class Welcome {
  // cycleDrivers = { WelcomeView: makeAureliaDriver(this) }
  
  cycle({ WelcomeView }:{ WelcomeView: ViewSource }) {
    const add$ = WelcomeView
      .actions('add_click') 
      // .do(ev => console.log(ev))
      .map(ev => 1)

    const count$ = add$
      .startWith(0)
      .scan<number>((total, change) => total + change)

    const name$ = WelcomeView
      .values('firstName')
      // .startWith('')
      .map(input => `${input} awesome`)
      // .do(ev => console.log(ev))

    const mouse$ = Observable
      .fromEvent<MouseEvent>(document, 'mousemove')
      .startWith({x: 0, y: 0} as MouseEvent)
      
    const counterValue$ = WelcomeView
      .values('counterValue')
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
