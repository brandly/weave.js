const _ = require('lodash')
const debug = require('debug')('require-statements')
const walk = require('acorn/dist/walk')

module.exports = findAllRequireStatements

function findAllRequireStatements (syntax) {
  const messyListOfRequires = findAllRequireStatementsHelper(syntax)

  return _.chain(messyListOfRequires)
          .flattenDeep()
          .filter(v => typeof v === 'string' && v.length)
          .uniq()
          .value()
}

function findAllRequireStatementsHelper (syntax) {
  debug('syntax', syntax)
  const statements = []

  walk.simple(syntax, {
    CallExpression (node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        statements.push(node.arguments[0].value)
      }
    }
  })

  return statements
}
