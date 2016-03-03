# aurelia-cycle

An Aurelia plugin that allows you to manage Aurelia's View-Bindings functionally, converting them into RxJS observables, consumable as Cycle.js drivers.

## Why?

If you're new to Observables or Cycle.js, I recommend watching the fantastic talk by Cycle.js' creator, [André Staltz](https://twitter.com/andrestaltz):

* [What if the user was a function?](https://www.youtube.com/watch?v=1zj7M1LnJV4) - Presentation at JSConf BP2015 by [Andre Staltz](https://twitter.com/andrestaltz)

## Why not simply use Cycle.js?

Cycle.js is more of an architecture style, a paradigm, a design concept, than a full-blown web-framework like Aurelia, Angular or even React. It's a way of dealing with data coming in and out - in a cycle, and it needs to drive a set of drivers to be useful.

This is one such driver that enables it to drive Aurelia's View-Bindings. Cycle.js has it's own effort to drive the DOM with the use of its [DOM Driver](https://github.com/cyclejs/dom), however it is still in an earlier phase than Aurelia and many problems need to be worked out. Aurelia on the other hand is already awesome at driving the DOM, so why not have the best of both worlds?

## Caveats

(alpha) Performance: Since this is still an early alpha, there is no diffing algorithm for complex objects or arrays returned into the sinks, which feed the view engine. This means that if you use a `repeat` strategy for displaying your data, their Views might get recreated every time new data is fed into the sink.

(alpha) Size: This driver uses Observables from RxJS 5, however the Cycle.js is still being rewritten into RxJS 5, and requires Rx 4 as well. Since both libraries have to be loaded, the size goes up by quite a bit. 

## Dependencies

* [aurelia-templating](https://github.com/aurelia/templating)
* [aurelia-logging](https://github.com/aurelia/logging)
* [@cycle/core](https://github.com/cyclejs/core)
* [@cycle/rxjs-adapter](https://github.com/cyclejs/rxjs-adapter)
* [rxjs](https://github.com/Reactive-Extensions/RxJS)

## Used By

This library isn't used by Aurelia. It is an optional plugin.

## Platform Support

This library can be used in the **browser** as well as on the **server**.

## How to install this plugin?

1. In your project install the plugin and `rxjs` via `jspm` with following command

```shell
jspm install aurelia-cycle rxjs
```
2. Make Aurelia load the plugin by adding the following line to the `configure` function in the `main.js` file of your `src` folder

```diff
  export function configure(aurelia) {
    aurelia.use
      .standardConfiguration()
      .developmentLogging();

+   aurelia.use.plugin('aurelia-cycle');

    aurelia.start().then(a => a.setRoot());
  }
```

## Using the plugin

The plugin enables you to use Aurelia's View-Bindings as Cycle.js drivers.

To make bindings visible to the driver you need to apply the `cycle` Binding Behavior to them as shown below:

```html
<template>
  <h2>${count & cycle}</h2>
  <button click.delegate="increment() & cycle">+</button>
  <button click.delegate="decrement() & cycle">-</button>
</template>
```

By defining the `cycle(sources)` method on a given ViewModel, the plugin will use it to run Cycle.js on it.

By default, one driver is created for you with the name *ClassName*View, but you may manually define the drivers by adding a `cycleDrivers` property to your ViewModel.

```javascript
import {Observable} from 'rxjs/Rx'
import {makeAureliaDriver, ViewSource} from 'aurelia-cycle'

export class Counter {
  // commented out, as this is done automatically by default:
  // cycleDrivers = { CounterView: makeAureliaDriver(this) }
  
  cycle({ CounterView }) {
    const action$ = Observable.merge(
      CounterView.actions('increment').map(ev => 1),
      CounterView.actions('decrement').map(ev => -1)
    )

    const count$ = action$
      .startWith(0)
      .scan((total, change) => total + change)

    const sinks = {
      CounterView: count$.map((count) => ({ 
        count: count
      }))
    }
    
    return sinks
  }
}
```

A ViewSource (`CounterView` in the above example) exposes two methods (mimicking the Cycle.js DOM driver's 'select' and 'events'):

`values(bindingName)`: returns an Observable with all the changes made to the value of the selected two-way binding
`actions(functionName)`: returns an Observable of all the calls made to the function of the selected name

The values of the Observable returned by `actions(functionName)` is an object that contains two properties: 

```js
{
  event, // this is the Event that caused the function to be invoked
  arguments // an Array of arguments passed to the function from the View
}
```

The ViewSink (in the return value of `cycle()`) should be an Observable of an object, which properties match the bindings names of the View.

The `cycle(sources)` method is run immediately after `bind()`.

For more examples, see the [example repository](https://github.com/niieani/aurelia-cycle-example).

## Building The Code

To build the code, follow these steps.

1. Ensure that [NodeJS](http://nodejs.org/) is installed. This provides the platform on which the build tooling runs.
2. From the project folder, execute the following command:

  ```shell
  npm install
  ```
3. Ensure that [Gulp](http://gulpjs.com/) is installed. If you need to install it, use the following command:

  ```shell
  npm install -g gulp
  ```
4. To build the code, you can now run:

  ```shell
  gulp build
  ```
5. You will find the compiled code in the `dist` folder, available in three module formats: AMD, CommonJS and ES6.

6. See `gulpfile.js` for other tasks related to generating the docs and linting.

## Running The Tests

To run the unit tests, first ensure that you have followed the steps above in order to install all dependencies and successfully build the library. Once you have done that, proceed with these additional steps:

1. Ensure that the [Karma](http://karma-runner.github.io/) CLI is installed. If you need to install it, use the following command:

  ```shell
  npm install -g karma-cli
  ```
2. Ensure that [jspm](http://jspm.io/) is installed. If you need to install it, use the following commnand:

  ```shell
  npm install -g jspm
  ```
3. Install the client-side dependencies with jspm:

  ```shell
  jspm install
  ```

4. You can now run the tests with this command:

  ```shell
  karma start
  ```
