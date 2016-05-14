'use strict'

const path = require('path')
const _ = require('lodash')
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
      console.log('dependency tree!')
      viewDependencyTree(tree)
    }
  })
}

function viewDependencyTree (tree, padding) {
  padding || (padding = '')

  const toPrint = tree.absolute + ' (' + tree.value + ')'
  padding ? console.log(padding, toPrint) : console.log(toPrint)

  const childrenPadding = padding + '-'
  tree.dependencies.forEach(dep => viewDependencyTree(dep, childrenPadding))
}
