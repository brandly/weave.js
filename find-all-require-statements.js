const _ = require('lodash')
const debug = require('debug')('require-statements')

module.exports = findAllRequireStatements

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
  debug('syntax', syntax)

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
      return findAllRequireStatementsHelper(syntax.right)
    case 'Literal':
    case 'MemberExpression':
    case 'Identifier':
    case 'EmptyStatement':
      return null
    case 'NewExpression':
      return syntax.arguments.map(findAllRequireStatementsHelper)
    case 'ObjectExpression':
      return syntax.properties.map(findAllRequireStatementsHelper)
    case 'Property':
      return findAllRequireStatementsHelper(syntax.value)
    case 'ConditionalExpression':
      return [syntax.test.right, syntax.test.left].map(findAllRequireStatementsHelper)
    default:
      throw new Error('unknown type! ' + syntax.type)
  }
}
