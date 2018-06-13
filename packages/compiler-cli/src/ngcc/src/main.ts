/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { resolve } from 'path';
import { findMetadataPaths } from './metadata-json-parser';
import { parseEntryPoint } from './ast-parser';

export function mainNgcc(
  args: string[],
  consoleError: (s: any) => void = console.error,
): number {
  const rootPath = args[0];

  // const metadataPaths = findMetadataPaths(rootPath);
  // parseMetadataPath(metadataPaths[0]);

  parseEntryPoint(resolve(rootPath, 'esm2015'), 'common.js');

  return 0;
}


