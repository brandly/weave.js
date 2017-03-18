'use strict'

const fs = require('fs')
const path = require('path')
const dependencyTree = require('./dependency-tree')

const preludePath = path.join(__dirname, 'prelude.js')
const prelude = fs.readFileSync(preludePath, 'utf8').toString().trim()

module.exports = weave

function weave (params) {
  const entry = params.entry
  const viewTree = params.viewTree

  const parsedEntry = path.parse(path.resolve(entry))
  const dir = parsedEntry.dir
  const value = './' + parsedEntry.name

  const baseDir = params.baseDir || parsedEntry.dir

  dependencyTree.build({ raw: value, value, dir, baseDir }, (error, tree) => {
    if (error) {
      console.trace(error)
      throw error
    } else {
      tree.entry = true

      if (viewTree) {
        dependencyTree.view(tree)
      } else {
        const allDependencies = flattenDependencyTree(tree, baseDir)
        const moduleIds = allDependencies.map(dep => dep.id)

        const modules = formatModules(allDependencies)
        const conclusion = [modules, '{}', JSON.stringify(moduleIds)].join(',')
        const output = `(${prelude})(${conclusion})`

        console.log(output)
      }
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
    getSource(dep),
    '\n},',
    '{' + Object.keys(dep.dependencies || {}).sort().map(function (key) {
      return JSON.stringify(key) + ':' + JSON.stringify(dep.dependencies[key])
    }).join(',') + '}',
    ']'
  ].join('')
}

function getSource (dep) {
  function wrapSource () {
    return [
      '(function(__filename,__dirname){',
      dep.source,
      '}).call(this,"' + dep.filename + '","' + dep.dirname + '")'
    ].join('\n')
  }

  // This can produce false positives...
  const needsNames = dep.source && (
    dep.source.includes('__dirname') || dep.source.includes('__filename')
  )
  return needsNames ? wrapSource() : dep.source
}

function flattenDependencyTree (tree, baseDir) {
  const store = {}
  flattenDependencyTreeHelper(tree, store)

  return Object.keys(store).map(absolute => {
    const current = store[absolute]

    const subDependencies = {}
    current.dependency.dependencies.map((dep) => {
      subDependencies[dep.value] = store[dep.absolute].id
    })

    const filename = '/' + path.relative(baseDir, absolute)
    const dirname = path.dirname(filename)

    const final = {
      id: current.id,
      dependencies: subDependencies,
      source: current.dependency.source,
      filename,
      dirname
    }

    if (current.dependency.entry) {
      final.entry = true
    }

    return final
  })
}

function flattenDependencyTreeHelper (tree, store) {
  if (!store[tree.absolute]) {
    store[tree.absolute] = {
      id: getNextNumber(),
      dependency: tree
    }
    tree.dependencies.forEach((dep) => flattenDependencyTreeHelper(dep, store))
  }
}

let nextNumber = 0
function getNextNumber () {
  return nextNumber++
}
