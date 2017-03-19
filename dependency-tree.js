'use strict'

const fs = require('fs')
const path = require('path')
const parser = require('esprima')
const async = require('async')
const browserBuiltins = require('browser-builtins')
const resolve = require('resolve')
const debug = require('debug')('build-dependency-tree')
const findAllRequireStatements = require('./find-all-require-statements')

module.exports = {
  build: buildDependencyTree,
  view: viewDependencyTree
}

// TODO: actually implement the spec
// TODO: handle circular dependencies
// https://nodejs.org/api/modules.html#modules_all_together
function buildDependencyTree (requirement, callback) {
  const value = requirement.value

  if (isCoreModuleName(value)) {
    loadAsCoreModule(requirement, callback)
    return
  }

  if (value.startsWith('./') || value.startsWith('/') || value.startsWith('../')) {
    debug('buildDependencyTree for file', requirement)

    loadAsFile(requirement, (error, tree) => {
      if (doesNotExistError(error)) {
        debug('file does not exist', requirement)
        loadAsDirectory(requirement, callback)
      } else if (error) {
        callback(error)
      } else {
        callback(null, tree)
      }
    })
    return
  } else {
    debug('buildDependencyTree for node_module', requirement)

    loadAsNodeModule(requirement, callback)
    return
  }
}

const CURRENT_DIR = path.resolve('./')
function viewDependencyTree (tree, padding) {
  padding || (padding = '')

  const toPrint = path.relative(CURRENT_DIR, tree.absolute) + ' (' + tree.value + ')'
  padding ? console.log(padding, toPrint) : console.log(toPrint)

  const childrenPadding = padding + '--'
  tree.dependencies.forEach(dep => viewDependencyTree(dep, childrenPadding))
}

function addDependenciesToFile (params, callback) {
  const source = params.source
  const syntax = params.syntax
  const value = params.value
  const raw = params.raw
  const dir = params.dir
  const fullPath = params.fullPath

  debug('addDependenciesToFile', { value, dir })

  const dirContainingFile = path.dirname(fullPath)
  const requiresList = findAllRequireStatements(syntax).map(value => {
    return { raw: value, value, dir: dirContainingFile }
  })
  debug('requiresList', JSON.stringify(requiresList))

  async.map(requiresList, buildDependencyTree, (error, dependencies) => {
    if (error) {
      callback(error)
    } else {
      const result = {
        absolute: path.resolve(dir, value),
        value: raw,
        source,
        syntax,
        dependencies
      }

      callback(null, result)
    }
  })
}

function loadAsFile (requirement, callback) {
  debug('loadAsFile', requirement)

  const value = requirement.value
  const dir = requirement.dir
  const raw = requirement.raw

  const fullPath = path.resolve(dir, value)
  debug('fullPath', fullPath)

  fs.readFile(fullPath, (error, results) => {
    if (doesNotExistError(error) && !value.endsWith('.js') && !value.endsWith('.json')) {
      const withJsExtension = value + '.js'

      loadAsFile(Object.assign({}, requirement, { value: withJsExtension }), (error, loaded) => {
        if (doesNotExistError(error)) {
          const withJsonExtension = value + '.json'
          loadAsFile(Object.assign({}, requirement, { value: withJsonExtension }), callback)
        } else if (error) {
          callback(error)
        } else {
          callback(null, loaded)
        }
      })
    } else if (illegalOperationOnDirectoryError(error)) {
      loadAsDirectory(requirement, callback)
    } else if (error) {
      callback(error)
    } else {
      let source = results.toString()

      if (value.endsWith('.json')) {
        source = 'module.exports=' + source.trim()
      }

      if (source.startsWith('#!')) {
        source = '//' + source
      }

      if (raw !== 'process' && source.includes('process')) {
        debug('injecting process', { raw, value, dir })
        source = 'var process = require("process");\n' + source
      }

      const syntax = parser.parse(source)

      addDependenciesToFile(Object.assign({}, requirement, {
        source, syntax, fullPath
      }), callback)
    }
  })
}

function loadAsDirectory (requirement, callback) {
  debug('loadAsDirectory', requirement)

  const value = requirement.value
  const dir = requirement.dir

  const pkgPath = path.resolve(dir, value, 'package.json')

  fs.open(pkgPath, 'r', (error, fd) => {
    if (doesNotExistError(error)) {
      loadAsFile(Object.assign({}, requirement, {
        value: './index.js',
        dir: path.join(dir, value)
      }), callback)
    } else if (error) {
      callback(error)
    } else {
      fs.close(fd, (error) => {
        if (error) {
          callback(error)
        } else {
          const pkg = require(pkgPath)
          const newDir = path.join(dir, value)
          let newValue = pkg.main || 'index.js'

          if (!newValue.startsWith('./')) {
            newValue = './' + newValue
          }

          buildDependencyTree(Object.assign({}, requirement, {
            dir: newDir,
            value: newValue
          }), callback)
        }
      })
    }
  })
}

function isCoreModuleName (value) {
  return !!browserBuiltins[value]
}

function loadAsCoreModule (requirement, callback) {
  const nodeModule = browserBuiltins[requirement.value]

  loadAsFile(Object.assign({}, requirement, {
    dir: path.dirname(nodeModule),
    value: './' + path.basename(nodeModule)
  }), callback)
}

function loadAsNodeModule (requirement, callback) {
  resolve(requirement.value, {
    basedir: requirement.dir
  }, function (error, modulePath) {
    if (error) {
      callback(error)
    } else {
      const dir = path.dirname(modulePath)
      const value = './' + path.basename(modulePath)

      loadAsFile(Object.assign({}, requirement, { dir, value }), callback)
    }
  })
}

function doesNotExistError (error) {
  return error && error.code === 'ENOENT'
}

function illegalOperationOnDirectoryError (error) {
  return error && error.code === 'EISDIR'
}
