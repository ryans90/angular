/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { R3ComponentMetadata, R3DirectiveMetadata, R3InjectableMetadata, R3NgModuleMetadata, compileInjectable } from '@angular/compiler';
import { resolve } from 'path';
import * as ts from 'typescript';
import { reflectImportedIdentifier } from '../../ngtsc/metadata/src/reflector';
import { AnalysisOutput } from '../../ngtsc/transform/src/api';
import { extractInjectableMetadata } from '../../ngtsc/transform/src/injectable';

export interface GroupedByDecoratorType<C, D = C, I = C, M = C, P = C> {
  components: C;
  directives: D;
  injectables: I;
  ngModules: M;
  pipes: P;
}

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
  decoratedClasses: GroupedByDecoratorType<DecoratedClass[]>;
}

interface ParsedPackageAnalysisOutput
  extends GroupedByDecoratorType<
    AnalysisOutput<R3ComponentMetadata>[],
    AnalysisOutput<R3DirectiveMetadata>[],
    AnalysisOutput<R3InjectableMetadata>[],
    AnalysisOutput<R3NgModuleMetadata>[],
    AnalysisOutput<any>[]> {
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
      decoratedClasses: {
        ngModules: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'NgModule'),
        pipes: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Pipe'),
        directives: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Directive'),
        components: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Component'),
        injectables: this.packageAdapter.findDecoratedClasses(typeChecker, entryPointFile, 'Injectable'),
      },
    };
  }

  analyzeDecorators(parsedPackage: ParsedPackage): ParsedPackageAnalysisOutput {
    const checker = parsedPackage.packageProgram.getTypeChecker();
    const injectableDecoratedClasses = parsedPackage.decoratedClasses.injectables;

    return {
      components: [],
      directives: [],
      injectables: this.packageAdapter.analyzeInjectableDecorators(checker, injectableDecoratedClasses),
      ngModules: [],
      pipes: [],
    };
  }

  transformDecorators(analysisOutputs: ParsedPackageAnalysisOutput): void {
    this.packageAdapter.transformInjectableDecorators(analysisOutputs.injectables);
  }
}

export interface PackageAdapter {
  findDecoratedClasses(typeChecker: ts.TypeChecker, entryPointFile: ts.SourceFile, decoratorName: string): DecoratedClass[];

  // TODO: Implement `analyzeXyzDecorators()` for all decorator types of interest.
  analyzeInjectableDecorators(typeChecker: ts.TypeChecker, decoratedCalsses: DecoratedClass[]): AnalysisOutput<R3InjectableMetadata>[];

  // TODO: Implement `transformXyzDecorators()` for all decorator types of interest.
  transformInjectableDecorators(analysisOutputs: AnalysisOutput<R3InjectableMetadata>[]): void;
}



export class Fesm2015PackageAdapter implements PackageAdapter {
  findDecoratedClasses(typeChecker: ts.TypeChecker, entryPointFile: ts.SourceFile, decoratorName: string): DecoratedClass[] {
    const symbols = typeChecker.getSymbolsInScope(entryPointFile, ts.SymbolFlags.Class | ts.SymbolFlags.Alias);
    const decoratedClasses: DecoratedClass[] = [];
    symbols.forEach(symbol => {
      if (symbol.exports && symbol.exports.has('decorators' as ts.__String)) {
        // Symbol of the identifier for `SomeSymbol.decorators`.
        const decoratorsProperty = symbol.exports.get('decorators' as ts.__String)!;
        const decoratorsIdentifier = decoratorsProperty.valueDeclaration;

        if (decoratorsIdentifier && decoratorsIdentifier.parent) {
          // AST of the array of decorator values
          const decoratorsValue = (decoratorsIdentifier.parent as ts.AssignmentExpression<ts.EqualsToken>).right;

          if (decoratorsValue && ts.isArrayLiteralExpression(decoratorsValue)) {
            const decoratorAst = decoratorsValue.elements
              .filter(ts.isObjectLiteralExpression)
              .find(element => isCoreDecorator(typeChecker, element, decoratorName));

            if (decoratorAst) {
              decoratedClasses.push({ classSymbol: symbol, decoratorsProperty, decoratorAst });
            }
          }
        }
      }
    });
    return decoratedClasses;
  }

  analyzeInjectableDecorators(checker: ts.TypeChecker, decoratedClasses: DecoratedClass[]): AnalysisOutput<R3InjectableMetadata>[] {
    return decoratedClasses.map(d => ({ analysis: this.analyzeInjectableDecorator(checker, d) }));
  }

  transformInjectableDecorators(analysisOutputs: AnalysisOutput<R3InjectableMetadata>[]): void {
    analysisOutputs
        .map(output => output.analysis!)
        .forEach(meta => {
          const def = compileInjectable(meta);
          console.error(def);
        });
  }

  private analyzeInjectableDecorator(checker: ts.TypeChecker, decoratedClass: DecoratedClass): R3InjectableMetadata {
    const clazz = decoratedClass.classSymbol.valueDeclaration!;

    if (!ts.isClassDeclaration(clazz)) {
      // Shouldn't happen.
      throw new Error(`Expected class-symbol \`valueDeclaration\` to be a \`ClassDeclaration\`: ${clazz}`);
    }

    const argsProperty = decoratedClass.decoratorAst.properties
        .filter(ts.isPropertyAssignment)
        .find(p => p.name.getText() === 'args');
    const argsValue = argsProperty && argsProperty.initializer;

    if (argsValue && !ts.isArrayLiteralExpression(argsValue)) {
      // Shouldn't happen.
      throw new Error(`Expected decorator \`args\` to be an \`ArrayLiteralExpression\`: ${argsValue}`);
    }

    // TODO: Fix this. `extractInjectableMetadata()` only uses the `decorator.args`.
    const decorator = { args: argsValue!.elements } as any;

    return extractInjectableMetadata(clazz, decorator, checker, () => []);
  }
}

function isCoreDecorator1(typeChecker: ts.TypeChecker, element: ts.ObjectLiteralExpression, decoratorName: string): boolean {
  const typeProperty = element.properties
    .filter(ts.isPropertyAssignment)
    .find(property => property.name.getText() === 'type');

  const typeSymbol = typeProperty && typeChecker.getSymbolAtLocation(typeProperty.initializer);
  const resolvedTypeSymbol = typeSymbol && typeChecker.getAliasedSymbol(typeSymbol);

  if (!resolvedTypeSymbol || resolvedTypeSymbol.escapedName !== decoratorName) {
    return false;
  }

  const originalFile = resolvedTypeSymbol.declarations![0].getSourceFile();
  return /([\\/])@angular\1core\1/.test(originalFile.fileName);
}

function isCoreDecorator(typeChecker: ts.TypeChecker, element: ts.ObjectLiteralExpression, decoratorName: string): boolean {
  const typeProperty = element.properties
    .filter(ts.isPropertyAssignment)
    .find(property => property.name.getText() === 'type');

  // If there is not `type` property, this is not a decorator.
  if (!typeProperty) {
    return false;
  }

  const typeIdentifier = typeProperty.initializer;

  // If the initializer is not an identifier, this is not a decorator.
  if (!ts.isIdentifier(typeIdentifier)) {
    return false;
  }

  const importDecl = reflectImportedIdentifier(typeIdentifier, typeChecker);

  // Ignore identifiers that were not imported (or otherwise failed to be reflected upon).
  if (!importDecl) {
    return false;
  }

  return importDecl.name === decoratorName && importDecl.from === '@angular/core';
}
