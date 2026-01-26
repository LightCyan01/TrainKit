import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const iconPath = resolve(process.cwd(), 'resources', 'icon');

function copyDirExclude(src: string, dest: string, exclude: string[]) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const shouldExclude = exclude.some(ex => entry === ex) ||
      entry === '__pycache__' ||
      entry.endsWith('_cache') ||
      (entry.startsWith('.') && entry !== '.');
    if (shouldExclude) continue;
    
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirExclude(srcPath, destPath, exclude);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: iconPath,
  },
  hooks: {
    postPackage: async (_config, options) => {
      const resourcesPath = join(options.outputPaths[0], 'resources');
      const backendDest = join(resourcesPath, 'backend');
      copyDirExclude('./backend', backendDest, ['.venv']);
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: iconPath + '.ico',
    }),
    new MakerZIP({}, ['win32'])
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
