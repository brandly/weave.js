'use strict'

const path = require('path')
const _ = require('lodash')
const shortId = require('shortid')
const getParentDir = require('./get-parent-dir')
const buildDependencyTree = require('./build-dependency-tree')
const entry = process.argv[2]

weave(entry)

function weave (entry) {
  const dir = path.resolve(getParentDir(entry))
  const value = './' + _.last(entry.split('/'))

  buildDependencyTree({ raw: value, value, dir }, (error, tree) => {
    if (error) {
      console.trace(error)
      throw error
    } else {
      tree.entry = true

      const allDependencies = flattenDependencyTree(tree)
      console.log('allDependencies', allDependencies)
    }
  })
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
