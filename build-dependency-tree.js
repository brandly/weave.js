'use strict'

const fs = require('fs')
const path = require('path')
const parser = require('esprima')
const _ = require('lodash')
const async = require('async')
const coreModulesNames = require('node-core-module-names')
const debug = require('debug')('build-dependency-tree')
const findAllRequireStatements = require('./find-all-require-statements')

module.exports = buildDependencyTree

// TODO: actually implement the spec
// TODO: handle circular dependencies
// https://nodejs.org/api/modules.html#modules_all_together
function buildDependencyTree (requirement, callback) {
  const value = requirement.value

  if (value.endsWith('.json')) {
    console.warn('Cannot handle json yet', value)
    callback(null, { absolute: value, dependencies: [] })
    return
  }

  if (_.includes(coreModulesNames, value)) {
    // TODO: handle built-in-to-node packages (core modules) like `path` and such
    console.warn('Cannot handle core modules yet:', value)
    callback(null, { absolute: value, dependencies: [] })
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

  const fullPath = path.resolve(dir, value)
  debug('fullPath', fullPath)

  fs.readFile(fullPath, (error, results) => {
    if (doesNotExistError(error) && !value.endsWith('.js')) {
      const withExtension = value + '.js'
      loadAsFile(Object.assign({}, requirement, { value: withExtension }), callback)
    } else if (illegalOperationOnDirectoryError(error)) {
      loadAsDirectory(requirement, callback)
    } else if (error) {
      callback(error)
    } else {
      const source = results.toString()
      const syntax = parser.parse(source)

      // TODO: figure out how to call this
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
          // TODO: should i _not_ use require?
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

function loadAsNodeModule (requirement, callback) {
  loadAsNodeModuleHelper({ requirement, dir: requirement.dir }, callback)
}

const nodeModuleDebug = require('debug')('node-modules')

function loadAsNodeModuleHelper (params, callback) {
  const requirement = params.requirement
  const dir = params.dir

  nodeModuleDebug('loadAsNodeModuleHelper', dir)

  findNodeModulesPath(dir, (error, nodeModulesDir) => {
    if (error) {
      callback(error)
    } else {
      loadAsDirectory(Object.assign({}, requirement, {
        dir: nodeModulesDir
      }), (error, tree) => {
        if (doesNotExistError(error) || notADirectory(error)) {
          loadAsNodeModuleHelper({ dir: path.dirname(dir), requirement }, callback)
        } else if (error) {
          callback(error)
        } else {
          callback(null, tree)
        }
      })
    }
  })
}

function findNodeModulesPath (dir, callback) {
  nodeModuleDebug('findNodeModulesPath', dir)

  const attempt = dir.endsWith('node_modules') ? dir : path.resolve(dir, 'node_modules')

  fs.open(attempt, 'r', function (error, fd) {
    if (doesNotExistError(error)) {
      // TODO: clean up this mess
      let splitDir = dir.split('node_modules')
      if (splitDir.length > 1) {
        splitDir = splitDir.slice(0, splitDir.length - 1)
      }
      const withoutFinalNodeModules = splitDir.join('node_modules')
      const newDir = path.dirname(withoutFinalNodeModules)
      nodeModuleDebug('doesNotExistError, newDir', newDir)
      return findNodeModulesPath(newDir, callback)
    } else if (error) {
      callback(error)
    } else {
      fs.close(fd, function (error) {
        callback(error, attempt)
      })
    }
  })
}

function doesNotExistError (error) {
  return error && error.code === 'ENOENT'
}

function notADirectory (error) {
  return error && error.code === 'ENOTDIR'
}

function illegalOperationOnDirectoryError (error) {
  return error && error.code === 'EISDIR'
}
