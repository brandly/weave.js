const fs = require('fs')
const path = require('path')
const parser = require('esprima')
const _ = require('lodash')
const async = require('async')
const coreModulesNames = require('node-core-module-names')
const debug = require('debug')('weave')
const findAllRequireStatements = require('./find-all-require-statements')

const entry = process.argv[2]

weave(entry)

function weave (entry) {
  const fullEntry = path.resolve(entry)

  buildDependencyTree(fullEntry, (error, results) => {
    if (error) {
      console.trace(error)
      throw error
    } else {
      console.log('dependency tree!')
      viewDependencyTree(results)
    }
  })
}

function viewDependencyTree (tree, padding) {
  padding || (padding = '')

  padding ? console.log(padding, tree.absolute) : console.log(tree.absolute)

  const childrenPadding = padding + '-'
  tree.dependencies.forEach(dep => viewDependencyTree(dep, childrenPadding))
}

// TODO: actually implement the spec
// https://nodejs.org/api/modules.html#modules_all_together
function buildDependencyTree (file, callback) {
  debug('buildDependencyTree', file)

  if (file.endsWith('.json')) {
    console.warn('Cannot handle json yet', file)
    callback(null, { absolute: file, dependencies: [] })
    return
  }

  if (_.includes(coreModulesNames, file)) {
    // TODO: handle built-in-to-node packages (core modules) like `path` and such
    console.warn('Cannot handle core modules yet:', file)
    callback(null, { absolute: file, dependencies: [] })
    return
  }

  // it's a node_module!
  if (!file.startsWith('/')) {
    debug('node_module!', file)

    findNodeModulesPath(file, (error, nodeModulesDir) => {
      if (error) {
        callback(error)
      } else {
        const modulePath = path.resolve(nodeModulesDir, file)
        loadAsDirectory(modulePath, callback)
      }
    })
    return
  }

  loadAsFile(file, (error, tree) => {
    if (doesNotExistError(error)) {
      loadAsDirectory(file, callback)
    } else if (error) {
      callback(error)
    } else {
      callback(null, tree)
    }
  })
}

function addDependenciesToFile (params, callback) {
  const source = params.source
  const syntax = params.syntax
  const file = params.file
  debug('addDependenciesToFile', file)

  const dir = getDirForFile(file)
  const requiresList = findAllRequireStatements(syntax)
  const absoluteRequires = requiresList.map(dep => dep.startsWith('.') ? path.resolve(dir, dep) : dep)

  async.map(absoluteRequires, buildDependencyTree, (error, dependencies) => {
    if (error) {
      callback(error)
    } else {
      const result = {
        absolute: file,
        source,
        syntax,
        dependencies
      }

      callback(null, result)
    }
  })
}

function loadAsFile (file, callback) {
  debug('loadAsFile', file)

  fs.readFile(file, (error, results) => {
    if (doesNotExistError(error) && !file.endsWith('.js')) {
      const withExtension = file + '.js'
      loadAsFile(withExtension, callback)
    } else if (illegalOperationOnDirectoryError(error)) {
      loadAsDirectory(file, callback)
    } else if (error) {
      callback(error)
    } else {
      const source = results.toString()
      const syntax = parser.parse(source)

      addDependenciesToFile({ source, syntax, file }, callback)
    }
  })
}

function loadAsDirectory (dir, callback) {
  debug('loadAsDirectory', dir)

  const pkgPath = path.resolve(dir, 'package.json')

  fs.open(pkgPath, 'r', (error) => {
    if (doesNotExistError(error)) {
      loadAsFile(path.resolve(dir, 'index.js'), callback)
    } else if (error) {
      callback(error)
    } else {
      // TODO: should i _not_ use require?
      const pkg = require(pkgPath)
      const moduleEntry = path.resolve(dir, pkg.main || 'index.js')

      buildDependencyTree(moduleEntry, callback)
    }
  })
}

function getDirForFile (file) {
  const splits = file.split('/')
  const dirs = splits.slice(0, splits.length - 1)
  return dirs.join('/')
}

function findNodeModulesPath (dir, callback) {
  debug('findNodeModulesPath', dir)

  const attempt = path.resolve(dir, 'node_modules')

  fs.open(attempt, 'r', function (error, fd) {
    if (doesNotExistError(error)) {
      return findNodeModulesPath(getParentDir(dir), callback)
    } else if (error) {
      callback(error)
    } else {
      callback(null, attempt)
    }
  })
}

function doesNotExistError (error) {
  return error && error.code === 'ENOENT'
}

function illegalOperationOnDirectoryError (error) {
  return error && error.code === 'EISDIR'
}

function getParentDir (dir) {
  const splits = dir.split('/')
  const dirs = splits.slice(0, splits.length - 1)
  const result = dirs.join('/')

  debug('getParentDir', dir, result)
  return result
}
