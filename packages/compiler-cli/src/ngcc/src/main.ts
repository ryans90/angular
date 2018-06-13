/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { resolve } from 'path';
import * as ts from 'typescript';
import * as shelljs from 'shelljs';

export function mainNgcc(
  args: string[],
  consoleError: (s: any) => void = console.error,
): number {
  const rootPath = args[0];
  const metadataPaths = findMetadataPaths(rootPath);
  // parseMetadataPath(metadataPaths[0]);

  parseEntryPoint(resolve(rootPath, 'esm2015'), 'common.js');

  return 0;
}

function parseEntryPoint(moduleFolder: string, moduleName: string) {
  const entryPoint = resolve(moduleFolder, moduleName);
  const options: ts.CompilerOptions = { allowJs: true, rootDir: moduleFolder };
  const host = ts.createCompilerHost(options);
  const program = ts.createProgram([entryPoint], options, host);
  const entryPointFile = program.getSourceFile(entryPoint)!;
  const typeChecker = program.getTypeChecker();
  const symbols = typeChecker.getSymbolsInScope(entryPointFile, ts.SymbolFlags.Class & ts.SymbolFlags.Alias);
  console.error(symbols.map(s => s.escapedName));

  const ngModules = findDecoratorASTs(typeChecker, symbols, 'NgModule');
  console.error('NgModules', ngModules.map(m => m!.symbol.escapedName));

  const pipes = findDecoratorASTs(typeChecker, symbols, 'Pipe');
  console.error('Pipes', pipes.map(m => m!.symbol.escapedName));

  const directives = findDecoratorASTs(typeChecker, symbols, 'Directive');
  console.error('Directives', directives.map(m => m!.symbol.escapedName));

  const components = findDecoratorASTs(typeChecker, symbols, 'Component');
  console.error('Components', components.map(m => m!.symbol.escapedName));

  const injectables = findDecoratorASTs(typeChecker, symbols, 'Injectable');
  console.error('Injectables', injectables.map(m => m!.symbol.escapedName));
}

function findDecoratorASTs(typeChecker: ts.TypeChecker, symbols: ts.Symbol[], decoratorName: string) {
  return symbols.map(symbol => {
    if (symbol.exports) {
      const decorators = symbol.exports.get('decorators' as ts.__String);
      // Symbol of the identifier for `SomeSymbol.decorators`
      if (decorators) {
        const decoratorsIdentifier = decorators.valueDeclaration;
        if (decoratorsIdentifier) {
          // AST of the array of decorator values
          const decoratorsValue = decoratorsIdentifier.parent && (decoratorsIdentifier.parent as any).right;
          if (decoratorsValue) {
            const ast = decoratorsValue.elements.find((element: ts.ObjectLiteralExpression) => isDecorator(typeChecker, element, decoratorName));
            if (ast) {
              return {
                symbol,
                decorators,
                ast
              };
            }
          }
        }
      }
    }
  }).filter(x => !!x);
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

function findMetadataPaths(rootPath: string) {
  return shelljs.find(rootPath).filter(p => /\.metadata\.json$/.test(p));
}

function parseMetadataPath(path: string) {
  const metadataFile = require(resolve(path));

  const filesSet = new Set();
  Object.keys(metadataFile.origins).forEach(key => {
    filesSet.add(metadataFile.origins[key]);
  });
  console.error(filesSet);

  const decorators: any = {};
  Object.keys(metadataFile.metadata).forEach(name => {
    const item = metadataFile.metadata[name];
    if (item.decorators) {
      item.decorators.forEach((decorator: any) => {
        const type = decorator.expression && decorator.expression.name;
        if (type) {
          const decoratorHolder = decorators[type] = decorators[type] || [];
          decoratorHolder.push({ name, type, args: decorator.arguments });
        }
      });
    }
  });

  console.error(decorators);
}

