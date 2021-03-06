'use strict';

/* eslint-env node */

const path = require('path');
const resolve = require('resolve');
const Funnel = require('broccoli-funnel');
const MergeTrees = require('broccoli-merge-trees');
const VersionChecker = require('ember-cli-version-checker');
const Rollup = require('broccoli-rollup');
const commonjs = require('rollup-plugin-commonjs');
const nodeResolve = require('rollup-plugin-node-resolve');
const babel = require('rollup-plugin-babel');

const jqueryPlugin = {
  name: 'chai-jquery',
  constraint: '^2.0.0',
  path: 'chai-jquery.js',
};

const domPlugin = {
  name: 'chai-dom',
  constraint: '^1.0.0',
  path: 'chai-dom.js',
};

const asPromisedPlugin = {
  name: 'chai-as-promised',
  constraint: '<6',
  path: 'chai-as-promised.js',
};

const asPromisedPlugin6 = {
  name: 'chai-as-promised',
  constraint: '^6 || ^7',
  path: 'chai-as-promised.js',
  rollup: {
    input: 'chai-as-promised.js',
    output: {
      file: 'chai/chai-as-promised.js',
      format: 'iife',
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      babel({
        presets: [["@babel/preset-env", { loose: true, modules: false }]],
      }),
    ],
  },
};

const sinonPlugin = {
  name: 'sinon-chai',
  constraint: '>=2.0.0',
  path: 'sinon-chai.js',
};

const testdoublePlugin = {
  name: 'testdouble-chai',
  constraint: '^0.5.0',
  path: 'testdouble-chai.js',
  supportFile: 'testdouble-chai.js'
};

const supportedPlugins = [
  jqueryPlugin,
  domPlugin,
  asPromisedPlugin,
  asPromisedPlugin6,
  sinonPlugin,
  testdoublePlugin
];

module.exports = {
  name: 'ember-cli-chai',

  init() {
    this._super.init && this._super.init.apply(this, arguments);

    let dependencies = Object.keys(this.project.pkg.dependencies || {});
    let devDependencies = Object.keys(this.project.pkg.devDependencies || {});
    let checker = new VersionChecker(this);

    this.plugins = supportedPlugins.filter(plugin => {
      return (dependencies.indexOf(plugin.name) !== -1 || devDependencies.indexOf(plugin.name) !== -1) &&
        checker.for(plugin.name, 'npm').satisfies(plugin.constraint);
    });

    // filter out `chai-dom` if `chai-jquery` is also installed as
    // having both plugins active results in conflicts
    let domPluginIndex = this.plugins.indexOf(domPlugin);
    let jqueryPluginIndex = this.plugins.indexOf(jqueryPlugin);
    if (jqueryPluginIndex !== -1 && domPluginIndex !== -1) {
      this.plugins.splice(domPluginIndex, 1);
    }

    // ensure that `sinon-chai` and `testdouble-chai` aren't both enabled,
    // since they use the same API
    let sinonIndex = this.plugins.indexOf(sinonPlugin);
    let tdIndex = this.plugins.indexOf(testdoublePlugin);
    if (sinonIndex !== -1 && tdIndex !== -1) {
      this.plugins.splice(tdIndex, 1);
    }
  },

  included(app) {
    this._super.included.apply(this, arguments);

    while (typeof app.import !== 'function' && app.app) {
      app = app.app;
    }

    app.import('vendor/chai/chai.js', { type: 'test' });
    app.import('vendor/shims/chai.js', { type: 'test' });

    for (let plugin of this.plugins) {
      app.import('vendor/chai/' + plugin.path, { type: 'test' });

      if (plugin.supportFile) {
        app.import('vendor/chai-plugin-support/' + plugin.supportFile, { type: 'test' });
      }
    }
  },

  treeForAddon() {
    if (this.app.tests) {
      return this._super.treeForAddon.apply(this, arguments);
    }
  },

  treeForVendor(tree) {
    let chaiPath = path.dirname(resolve.sync('chai'));
    let chaiTree = new Funnel(chaiPath, {
      files: ['chai.js'],
      destDir: '/chai',
    });

    let trees = [tree, chaiTree];

    let basedir = this.project.root;
    for (let plugin of this.plugins) {
      let pluginTree;

      if (plugin.rollup) {
        pluginTree = new Rollup(__dirname + '/rollup', { rollup: plugin.rollup });

      } else {
        let pluginPath = path.dirname(resolve.sync(plugin.name, { basedir: basedir }));
        pluginTree = new Funnel(pluginPath, {
          files: [plugin.path],
          destDir: '/chai',
        });
      }

      trees.push(pluginTree);
    }

    return new MergeTrees(trees, {
      annotation: 'ember-cli-chai: treeForVendor'
    });
  }
};
