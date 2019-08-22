import * as fs from 'fs';
import * as path from 'path';
import * as webpack from 'webpack';
import { RawSource } from 'webpack-sources';

interface Dependencies {
  [pkgName: string]: string
}

interface Engines {
  [engine: string]: string
}

interface Options {
  name?: string;
  version?: string;
  main?: string;
  author?: string;
  engines?: Engines;
}

interface Package {
  name?: string;
  version?: string;
  main?: string;
  author?: string;
  dependencies: Dependencies;
  engines: Engines;
}

class WebpackPackageJson {
  options: Options;
  basePath: string;

  constructor(options?: Options) {
    this.options = options || {};
    this.basePath = process.cwd();
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.emit.tap(this.constructor.name, async (compilation: webpack.compilation.Compilation) => {
      const pkg: Package = {
        name: this.options.name || '',
        version: this.options.version || this.getVersion(compilation),
        main: this.options.main || '',
        author: this.options.author || '',
        dependencies: {},
        engines: this.options.engines || {},
      }
      
      // Loop through all the entrypoints and generate their package.json
      for (const [ entrypointName, entrypoint ] of compilation.entrypoints.entries()) {
        const entryPkg = Object.assign({}, { ...pkg });
        const externalDeps = new Set<string>();

        // Generate a name and output file
        if (entryPkg.name === '') {
          entryPkg.name = entrypointName;
        }
        if (entryPkg.main === '') {
          entryPkg.main = entrypoint.getRuntimeChunk().files[0];
        }

        // Find all the external dependencies
        for (const chunk of entrypoint.chunks) {
          for (const mod of chunk.modulesIterable) {
            if (this.isExternalDep(mod.userRequest)) {
              if (mod.external) {
                externalDeps.add(mod.userRequest);
              }
            }
          }
        }

        // Map packages into a their output format
        const deps = this.mapModuleVersions(externalDeps);
        deps.forEach((version, dep) => {
          entryPkg.dependencies[dep] = version;
        });

        // Convert the package.json and generate path
        const pkgString = JSON.stringify(entryPkg);
        const outPath = path.join(basename(entrypointName), '/package.json');

        // Save the output files
        compilation.assets[outPath] = new RawSource(pkgString);
				entrypoint.getRuntimeChunk().files.push(outPath);
      }
    });
  }

  /**
   * Yeah this is not a great way to find the version of the dependency
   * @param deps 
   */
  private mapModuleVersions(deps: Set<string>): Map<string, string> {
    const base = `${this.basePath}/node_modules/`;
    const out = new Map<string, string>();

    deps.forEach(dep => {
      const pkgPath = path.join(base, dep, '/package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgJson = require(pkgPath);

        out.set(dep, pkgJson.version);
      }
    });

    return out;
  }

  private getVersion(compilation: webpack.compilation.Compilation) {
    const stats = compilation.getStats();

    return stats.hash;
  }

  private isExternalDep(depRequest: string): boolean {
    if (depRequest === undefined) {
      return false;
    }

    return !depRequest.startsWith(this.basePath);
  }
}

function basename(name: string) {
	if (!name.includes( '/' )) {
		return name;
	}
	return name.substr(name.lastIndexOf( '/' ) + 1);
}

export = WebpackPackageJson;
