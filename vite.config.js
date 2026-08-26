// Copyright (c) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

const banner = [
  '/*! ember — Copyright (c) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>',
  ' *  Licensed under the MIT License. See the LICENSE file in the source tree.',
  ' */',
].join('\n');

export default {
  // Keep the copyright notice in the minified output, not just in the sources.
  esbuild: { legalComments: 'inline' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { banner },
    },
  },
}
