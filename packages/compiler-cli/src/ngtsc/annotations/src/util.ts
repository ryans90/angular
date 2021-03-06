/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Expression, R3DependencyMetadata, R3ResolvedDependencyType, WrappedNodeExpr} from '@angular/compiler';
import * as ts from 'typescript';

import {Reference, reflectConstructorParameters} from '../../metadata';
import {reflectImportedIdentifier} from '../../metadata/src/reflector';

export function getConstructorDependencies(
    clazz: ts.ClassDeclaration, checker: ts.TypeChecker): R3DependencyMetadata[] {
  const useType: R3DependencyMetadata[] = [];
  const ctorParams = (reflectConstructorParameters(clazz, checker) || []);
  ctorParams.forEach(param => {
    let tokenExpr = param.typeValueExpr;
    let optional = false, self = false, skipSelf = false, host = false;
    let resolved = R3ResolvedDependencyType.Token;
    param.decorators.filter(dec => dec.from === '@angular/core').forEach(dec => {
      if (dec.name === 'Inject') {
        if (dec.args.length !== 1) {
          throw new Error(`Unexpected number of arguments to @Inject().`);
        }
        tokenExpr = dec.args[0];
      } else if (dec.name === 'Optional') {
        optional = true;
      } else if (dec.name === 'SkipSelf') {
        skipSelf = true;
      } else if (dec.name === 'Self') {
        self = true;
      } else if (dec.name === 'Host') {
        host = true;
      } else if (dec.name === 'Attribute') {
        if (dec.args.length !== 1) {
          throw new Error(`Unexpected number of arguments to @Attribute().`);
        }
        tokenExpr = dec.args[0];
        resolved = R3ResolvedDependencyType.Attribute;
      } else {
        throw new Error(`Unexpected decorator ${dec.name} on parameter.`);
      }
    });
    if (tokenExpr === null) {
      throw new Error(
          `No suitable token for parameter ${(param.name as ts.Identifier).text} of class ${clazz.name!.text} with decorators ${param.decorators.map(dec => dec.from + '#' + dec.name).join(',')}`);
    }
    if (ts.isIdentifier(tokenExpr)) {
      const importedSymbol = reflectImportedIdentifier(tokenExpr, checker);
      if (importedSymbol !== null && importedSymbol.from === '@angular/core') {
        switch (importedSymbol.name) {
          case 'ElementRef':
            resolved = R3ResolvedDependencyType.ElementRef;
            break;
          case 'Injector':
            resolved = R3ResolvedDependencyType.Injector;
            break;
          case 'TemplateRef':
            resolved = R3ResolvedDependencyType.TemplateRef;
            break;
          case 'ViewContainerRef':
            resolved = R3ResolvedDependencyType.ViewContainerRef;
            break;
          default:
            // Leave as a Token or Attribute.
        }
      }
    }
    const token = new WrappedNodeExpr(tokenExpr);
    useType.push({token, optional, self, skipSelf, host, resolved});
  });
  return useType;
}

export function referenceToExpression(ref: Reference, context: ts.SourceFile): Expression {
  const exp = ref.toExpression(context);
  if (exp === null) {
    throw new Error(`Could not refer to ${ts.SyntaxKind[ref.node.kind]}`);
  }
  return exp;
}
