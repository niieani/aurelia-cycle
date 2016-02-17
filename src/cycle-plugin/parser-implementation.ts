/*
import {
	ParserImplementation as StandardParserImplementation
} from '../aurelia-binding/parser';

import {
	CallMember,
	AccessMember,
	AccessKeyed,
	CallFunction
} from '../aurelia-binding/ast';
*/
// /*
import {
	ParserImplementation as StandardParserImplementation
} from 'aurelia-binding';

import {
	CallMember,
	AccessMember,
	AccessKeyed,
	CallFunction,
  AccessThis,
  AccessScope
} from 'aurelia-binding';
// */
import {AsyncExpression} from './async-expression';

/*
* Overrides the standard ParserImplementation's parseAccessOrCallMember method.
*/
export class ParserImplementation extends StandardParserImplementation {
  parseAccessOrCallMember(result?) {
    // PATCH
    result = result || this.parsePrimary();
    // let result = this.parsePrimary();
    // /PATCH

    while (true) {
      // PATCH
      let async;
      // /PATCH
      
      if (this.optional('.')) {
        // PATCH
        async = this.optional('.');
        // /PATCH
        
        let name = this.peek.text; // TODO(kasperl): Check that this is an identifier. Are keywords okay?

        this.advance();

        // PATCH
        if (async) {
          if (name !== 'value' && name !== 'ready') {
            throw new Error('Expected "..value" or "..ready".');
          }
          // result = new AccessMember(result, name);
          console.log('result', result, result.ancestor);
          // result = new AccessScope(name, result.ancestor);
          // console.log('result', result, result.ancestor);
          result = new AsyncExpression(result, name === 'ready');
          console.log('result', result, result.ancestor);
          return this.parseAccessOrCallMember(result);
        }
        // /PATCH
        
        if (this.optional('(')) {
          let args = this.parseExpressionList(')');
          this.expect(')');
          if (result instanceof AccessThis) {
            result = new CallScope(name, args, result.ancestor);
          } else {
            result = new CallMember(result, name, args);
          }
        } else {
          if (result instanceof AccessThis) {
            result = new AccessScope(name, result.ancestor);
          } else {
            result = new AccessMember(result, name);
          }
        }
      } else if (this.optional('[')) {
        let key = this.parseExpression();
        this.expect(']');
        result = new AccessKeyed(result, key);
      } else if (this.optional('(')) {
        let args = this.parseExpressionList(')');
        this.expect(')');
        result = new CallFunction(result, args);
      } else {
        return result;
      }
    }
  }
  	
	parseAccessOrCallMember2(result?) {
    result = result || this.parsePrimary();

    while (true) {
      var async, args;
      if (this.optional('.')) {
        async = this.optional('.');
        var name = this.peek.text;
        this.advance();
        if (async) {
          if (name !== 'value' && name !== 'ready') {
            throw new Error('Expected "..value" or "..ready".');
          }
          result = new AsyncExpression(result, name === 'ready');
          return this.parseAccessOrCallMember(result);
        }
        if (this.optional('(')) {
          args = this.parseExpressionList(')');
          this.expect(')');
          result = new CallMember(result, name, args);
        } else {
          result = new AccessMember(result, name);
        }
      } else if (this.optional('[')) {
        var key = this.parseExpression();
        this.expect(']');
        result = new AccessKeyed(result, key);
      } else if (this.optional('(')) {
        args = this.parseExpressionList(')');
        this.expect(')');
        result = new CallFunction(result, args);
      } else {
        return result;
      }
    }
  }
}
