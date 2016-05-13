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

  if (typeof syntax === 'undefined' || syntax === null) {
    console.trace('why tho')
  }

  switch (syntax.type) {
    case 'Program':
    case 'BlockStatement':
      return syntax.body.map(findAllRequireStatementsHelper)
    case 'VariableDeclaration':
      return syntax.declarations.map(findAllRequireStatementsHelper)
    case 'VariableDeclarator':
      return syntax.init && findAllRequireStatementsHelper(syntax.init)
    case 'CallExpression':
      if (syntax.callee.type === 'Identifier' && syntax.callee.name === 'require') {
        return syntax.arguments[0].value
      } else {
        return null
      }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'CatchClause':
      return findAllRequireStatementsHelper(syntax.body)
    case 'ReturnStatement':
    case 'UpdateExpression':
    case 'UnaryExpression':
    case 'ThrowStatement':
      return syntax.argument && findAllRequireStatementsHelper(syntax.argument)
    case 'ExpressionStatement':
      return findAllRequireStatementsHelper(syntax.expression)
    case 'AssignmentExpression':
      return findAllRequireStatementsHelper(syntax.right)
    case 'Literal':
    case 'MemberExpression':
    case 'Identifier':
    case 'EmptyStatement':
    case 'BreakStatement':
    case 'ThisExpression':
    case 'TemplateElement':
      return null
    case 'TemplateLiteral':
      return syntax.quasis.concat(syntax.expressions).map(findAllRequireStatementsHelper)
    case 'SequenceExpression':
      return syntax.expressions.map(findAllRequireStatementsHelper)
    case 'NewExpression':
      return syntax.arguments.map(findAllRequireStatementsHelper)
    case 'ObjectExpression':
      return syntax.properties.map(findAllRequireStatementsHelper)
    case 'Property':
      return findAllRequireStatementsHelper(syntax.value)
    case 'BinaryExpression':
    case 'LogicalExpression':
      return [syntax.right, syntax.left].map(findAllRequireStatementsHelper)
    case 'ForInStatement':
      return [syntax.right, syntax.left, syntax.body].map(findAllRequireStatementsHelper)
    case 'ForStatement':
      return [syntax.init, syntax.test, syntax.update, syntax.body].map(findAllRequireStatementsHelper)
    case 'WhileStatement':
      return [syntax.test, syntax.body].map(findAllRequireStatementsHelper)
    case 'ConditionalExpression':
    case 'IfStatement':
      return [syntax.test, syntax.consequent, syntax.alternate].filter(notNull).map(findAllRequireStatementsHelper)
    case 'ArrayExpression':
      return syntax.elements.map(findAllRequireStatementsHelper)
    case 'TryStatement':
      return [syntax.block].concat(syntax.handlers).map(findAllRequireStatementsHelper)
    case 'SwitchStatement':
      return [syntax.discriminant].concat(syntax.cases).map(findAllRequireStatementsHelper)
    case 'SwitchCase':
      return [syntax.test].concat(syntax.consequent).filter(notNull).map(findAllRequireStatementsHelper)
    default:
      throw new Error('unknown type! ' + syntax.type)
  }
}

function notNull (val) {
  return val !== null
}
