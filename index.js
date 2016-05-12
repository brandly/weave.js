const fs = require('fs')
const path = require('path')
const parser = require('esprima')
const _ = require('lodash')
const async = require('async')

const entry = './example/index.js'

weave(entry)

function weave (entry) {
  const fullEntry = path.resolve(entry)

  buildDependencyTree(fullEntry, (error, results) => {
    if (error) {
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

function buildDependencyTree (file, callback) {
  // TODO: handle built-in-to-node packages like `path` and such
  // it's a node_module!
  if (!file.startsWith('/')) {
    findNodeModulesPath(getDirForFile(file), (error, nodeModulesDir) => {
      if (error) {
        callback(error)
      } else {
        const modulePath = path.resolve(nodeModulesDir, file)

        const pkg = require(path.resolve(modulePath, 'package.json'))
        const moduleEntry = path.resolve(modulePath, pkg.main || 'index.js')

        buildDependencyTree(moduleEntry, callback)
      }
    })
    return
  }

  // TODO: handle file paths like `src` hitting `src/index.js`
  if (!file.endsWith('.js')) {
    file += '.js'
  }

  fs.readFile(file, (error, results) => {
    if (error) {
      callback(error)
    } else {
      const source = results.toString()
      const syntax = parser.parse(source)

      addDependenciesToFile({ source, syntax, file }, callback)
    }
  })
}

function addDependenciesToFile (params, callback) {
  const source = params.source
  const syntax = params.syntax
  const file = params.file

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

function findAllRequireStatements (syntax) {
  const messyListOfRequires = findAllRequireStatementsHelper(syntax)

  return _.chain(messyListOfRequires)
          .flattenDeep()
          .filter(v => typeof v === 'string' && v.length)
          .uniq()
          .value()
}

// TODO: read some esprima docs and be more thorough here
function findAllRequireStatementsHelper (syntax) {
  switch (syntax.type) {
    case 'Program':
      return syntax.body.map(findAllRequireStatementsHelper)
    case 'VariableDeclaration':
      return syntax.declarations.map(findAllRequireStatementsHelper)
    case 'VariableDeclarator':
      return findAllRequireStatementsHelper(syntax.init)
    case 'CallExpression':
      if (syntax.callee.type === 'Identifier' && syntax.callee.name === 'require') {
        return syntax.arguments[0].value
      } else {
        return null
      }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return syntax.body.body.map(findAllRequireStatementsHelper)
    case 'ReturnStatement':
      return findAllRequireStatementsHelper(syntax.argument)
    case 'ExpressionStatement':
      return findAllRequireStatementsHelper(syntax.expression)
    case 'AssignmentExpression':
      return findAllRequireStatements(syntax.right)
    case 'Literal':
    case 'MemberExpression':
    case 'Identifier':
    case 'EmptyStatement':
      return null
    case 'NewExpression':
      return syntax.arguments.map(findAllRequireStatements)
    case 'ObjectExpression':
      return syntax.properties.map(findAllRequireStatements)
    case 'Property':
      return findAllRequireStatements(syntax.value)
    default:
      throw new Error('unknown type! ' + syntax.type)
  }
}

function getDirForFile (file) {
  const splits = file.split('/')
  const dirs = splits.slice(0, splits.length - 1)
  return dirs.join('/')
}

function findNodeModulesPath (dir, callback) {
  const attempt = path.resolve(dir, 'node_modules')

  fs.open(attempt, 'r', function (err, fd) {
    if (err && err.code === 'ENOENT') {
      return findNodeModulesPath(getParentDir(dir), callback)
    } else if (err) {
      callback(err)
    } else {
      callback(null, attempt)
    }
  })
}

function getParentDir (dir) {
  const splits = dir.split('/')
  const dirs = splits.slice(0, splits.length - 1)
  return dirs.join('/')
}
