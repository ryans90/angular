/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { resolve } from 'path';
import * as ts from 'typescript';

export interface DecoratedClass {
  classSymbol: ts.Symbol;
  decoratorsProperty: ts.Symbol;
  decoratorAst: ts.ObjectLiteralExpression;
}

export interface ParsedPackage {
  packagePath: string;
  entryPointPath: string;
  packageProgram: ts.Program;
  entryPointFile: ts.SourceFile;
  components: DecoratedClass[];
  directives: DecoratedClass[];
  injectables: DecoratedClass[];
  ngModules: DecoratedClass[];
  pipes: DecoratedClass[];
}


export class PackageParser {
  constructor(private packageAdapter: PackageAdapter) {}

  parseEntryPoint(packagePath: string, entryPoint: string): ParsedPackage {
    const entryPointPath = resolve(packagePath, entryPoint);
    const options: ts.CompilerOptions = { allowJs: true, rootDir: packagePath };
    const host = ts.createCompilerHost(options);
    const packageProgram = ts.createProgram([entryPointPath], options, host);
    const entryPointFile = packageProgram.getSourceFile(entryPointPath)!;
    const typeChecker = packageProgram.getTypeChecker();

    return {
      packagePath,
      entryPointPath,
      packageProgram,
      entryPointFile,
      ngModules: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'NgModule'),
      pipes: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Pipe'),
      directives: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Directive'),
      components: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Component'),
      injectables: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Injectable'),
    };
  }
}

export interface PackageAdapter {
  findDecoratedClasses(typeChecker: ts.TypeChecker, entryPointFile: ts.SourceFile, decoratorName: string): DecoratedClass[];
}



export class Fesm2015PackageAdapter implements PackageAdapter {
  findDecoratedClasses(typeChecker: ts.TypeChecker, entryPointFile: ts.SourceFile, decoratorName: string): DecoratedClass[] {
    const symbols = typeChecker.getSymbolsInScope(entryPointFile, ts.SymbolFlags.Class | ts.SymbolFlags.Alias);
    const decoratedClasses: DecoratedClass[] = [];
    symbols.forEach(symbol => {
      if (symbol.exports) {
        const decoratorsProperty = symbol.exports.get('decorators' as ts.__String);
        // Symbol of the identifier for `SomeSymbol.decorators`
        if (decoratorsProperty) {
          const decoratorsIdentifier = decoratorsProperty.valueDeclaration;
          if (decoratorsIdentifier) {
            // AST of the array of decorator values
            const decoratorsValue = decoratorsIdentifier.parent && (decoratorsIdentifier.parent as any).right;
            if (decoratorsValue) {
              const decoratorAst = decoratorsValue.elements.find((element: ts.ObjectLiteralExpression) => isDecorator(typeChecker, element, decoratorName));
              if (decoratorAst) {
                decoratedClasses.push({ classSymbol: symbol, decoratorsProperty, decoratorAst });
              }
            }
          }
        }
      }
    });
    return decoratedClasses;
  }
}

function isDecorator(typeChecker: ts.TypeChecker, element: ts.ObjectLiteralExpression, decoratorName: string) {
  return element.properties.some(property =>
    ts.isPropertyAssignment(property) &&
    property.name.getText() === 'type' &&
    isCoreDecorator(typeChecker, decoratorName, typeChecker.getSymbolAtLocation(property.initializer)!)
  );
}

function isCoreDecorator(typeChecker: ts.TypeChecker, decoratorName: string, symbol: ts.Symbol) {
  const resolvedSymbol = typeChecker.getAliasedSymbol(symbol);
  if (resolvedSymbol && resolvedSymbol.escapedName === decoratorName) {
    const originalFile = resolvedSymbol.declarations![0]!.getSourceFile();
    return /([\\\/])@angular\1core\1/.test(originalFile.fileName);
  }
  return false;
}

