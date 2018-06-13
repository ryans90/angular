/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { resolve } from 'path';
import { findMetadataPaths } from './metadata-json-parser';
import { Fesm2015PackageAdapter, PackageParser } from './ast-parser';

export function mainNgcc(
  args: string[],
  consoleError: (s: any) => void = console.error,
): number {
  const rootPath = args[0];

  // const metadataPaths = findMetadataPaths(rootPath);
  // parseMetadataPath(metadataPaths[0]);
  const packageParser = new PackageParser(new Fesm2015PackageAdapter());
  const parsedPackage = packageParser.parseEntryPoint(resolve(rootPath, 'fesm2015'), 'common.js');
  const analysisOutput = packageParser.analyzeDecorators(parsedPackage);
  packageParser.transformDecorators(analysisOutput);

  // const decoratedClasses = parsedPackage.decoratedClasses;
  // console.error('Components', decoratedClasses.components.map(m => m!.classSymbol.escapedName));
  // console.error('Directives', decoratedClasses.directives.map(m => m!.classSymbol.escapedName));
  // console.error('Injectables', decoratedClasses.injectables.map(m => m!.classSymbol.escapedName));
  // console.error('NgModules', decoratedClasses.ngModules.map(m => m!.classSymbol.escapedName));
  // console.error('Pipes', decoratedClasses.pipes.map(m => m!.classSymbol.escapedName));

  return 0;
}


