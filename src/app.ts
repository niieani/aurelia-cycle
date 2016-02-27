import {Router, RouterConfiguration} from 'aurelia-router'
// import Cycle from '@cycle/core';
// import {Observable} as Rx from '../jspm_packages/npm/rxjs@5.0.0-beta.1/Rx';

export class App {
  router: Router;
  
  configureRouter(config: RouterConfiguration, router: Router) {
    config.title = 'Aurelia';
    config.map([
      { route: ['welcome2'], name: 'welcome',      moduleId: 'welcome',      nav: true, title: 'Welcome' },
      { route: ['', 'welcome'], name: 'welcome',      moduleId: 'welcome',      nav: true, title: 'Welcome' },
      { route: 'users',         name: 'users',        moduleId: 'users',        nav: true, title: 'Github Users' },
      { route: 'child-router',  name: 'child-router', moduleId: 'child-router', nav: true, title: 'Child Router' }
    ]);

    this.router = router;
  }
}
