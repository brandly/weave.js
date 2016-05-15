'use strict'

const fs = require('fs')
const path = require('path')
const shortId = require('shortid')
const buildDependencyTree = require('./build-dependency-tree')
const entry = process.argv[2]

const prelude = fs.readFileSync('./prelude.txt').toString().trim()

weave(entry)

function weave (entry) {
  const parsed = path.parse(path.resolve(entry))
  const dir = parsed.dir
  const value = './' + parsed.name

  buildDependencyTree({ raw: value, value, dir }, (error, tree) => {
    if (error) {
      console.trace(error)
      throw error
    } else {
      tree.entry = true

      const allDependencies = flattenDependencyTree(tree)
      const moduleIds = allDependencies.map(dep => dep.id)

      const modules = formatModules(allDependencies)
      const conclusion = [modules, '{}', JSON.stringify(moduleIds)].join(',')
      const output = `(${prelude})(${conclusion})`

      console.log(output)
    }
  })
}

function formatModules (dependencies) {
  return `{${dependencies.map(formatSingleModule).join(',')}}`
}

function formatSingleModule (dep) {
  return [
    JSON.stringify(dep.id),
    ':[',
    'function(require,module,exports){\n',
    dep.source,
    '\n},',
    '{' + Object.keys(dep.dependencies || {}).sort().map(function (key) {
      return JSON.stringify(key) + ':' + JSON.stringify(dep.dependencies[key])
    }).join(',') + '}',
    ']'
  ].join('')
}

function flattenDependencyTree (tree) {
  const store = {}
  flattenDependencyTreeHelper(tree, store)

  const masterList = []
  Object.keys(store).forEach(absolute => {
    const current = store[absolute]

    const subDependencies = {}
    current.dependency.dependencies.map((dep) => {
      subDependencies[dep.value] = store[dep.absolute].id
    })

    const final = {
      id: current.id,
      dependencies: subDependencies,
      source: current.dependency.source
    }

    if (current.dependency.entry) {
      final.entry = true
    }

    masterList.push(final)
  })

  return masterList
}

function flattenDependencyTreeHelper (tree, store) {
  if (!store[tree.absolute]) {
    store[tree.absolute] = {
      id: shortId.generate(),
      dependency: tree
    }
    tree.dependencies.forEach((dep) => flattenDependencyTreeHelper(dep, store))
  }
}

function viewDependencyTree (tree, padding) {
  padding || (padding = '')

  const toPrint = tree.absolute + ' (' + tree.value + ')'
  padding ? console.log(padding, toPrint) : console.log(toPrint)

  const childrenPadding = padding + '-'
  tree.dependencies.forEach(dep => viewDependencyTree(dep, childrenPadding))
}
