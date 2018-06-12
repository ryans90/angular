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
  parseMetadataPath(metadataPaths[0]);
  return 0;
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

  const options = {};
  const host = ts.createCompilerHost(options);
  const program = ts.createProgram(Array.from(filesSet), options, host);
  console.error(program);

  const decorators: any = {};
  Object.keys(metadataFile.metadata).forEach(name => {
    const item = metadataFile.metadata[name];
    if (item.decorators) {
      item.decorators.forEach((decorator: any) => {
        const type = decorator.expression && decorator.expression.name;
        if (type) {
          const decoratorHolder = decorators[type] = decorators[type] || [];
          decoratorHolder.push({ name, type, args: decorator.expression.args });
        }
      });
    }
  });

  console.error(decorators);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  process.exitCode = mainNgcc(args);
}
