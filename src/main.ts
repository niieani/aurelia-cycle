import 'bootstrap';
import {Aurelia} from 'aurelia-framework';
import {InterceptBindingBehavior} from './aurelia-cycle'

export function configure(aurelia: Aurelia) {
  aurelia.use
    .standardConfiguration()
    .developmentLogging()
    .plugin('./dist/cycle-plugin/index');
    // .plugin('aurelia-async');

  //Uncomment the line below to enable animation.
  //aurelia.use.plugin('aurelia-animator-css');

  //Anyone wanting to use HTMLImports to load views, will need to install the following plugin.
  //aurelia.use.plugin('aurelia-html-import-template-loader')

  // aurelia.enhance()
  // aurelia.globalResources('./aurelia-cycle');
  
  // aurelia.resources.registerBindingBehavior('intercept', new InterceptBindingBehavior())
  aurelia.start().then(() => aurelia.setRoot());
}
