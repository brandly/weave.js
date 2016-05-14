'use strict'
const debug = require('debug')('get-parent-dir')

module.exports = getParentDir

// TODO: might be able to replace this with some `path` function
function getParentDir (dir) {
  if (dir.endsWith('/')) {
    dir = dir.slice(0, dir.length - 1)
  }
  const splits = dir.split('/')
  const dirs = splits.slice(0, splits.length - 1)
  const result = dirs.join('/')

  debug(dir, result)
  return result
}
