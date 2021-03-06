'use strict'

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')
const assert = require('assert')

const browserBuiltins = require('browser-builtins')
const contra = require('contra')
const parser = require('acorn')
const walk = require('acorn/dist/walk')
const resolve = require('resolve')
const debug = require('debug')('weave')

const preludePath = path.join(__dirname, 'prelude.js')
const prelude = fs.readFileSync(preludePath, 'utf8').toString().trim()
const noop = () => {}

module.exports = class Weave {
  constructor (params) {
    const { entry, baseDir } = params

    const parsedEntry = path.parse(path.resolve(entry))
    const dir = parsedEntry.dir
    const value = './' + parsedEntry.name

    this.dir = dir
    this.value = value
    this.baseDir = baseDir || dir
  }

  bundle (stream) {
    const req = new RequireStatement(this.dir, this.value)

    stream.write(`(${prelude})({`)

    const moduleIds = []
    new DependencyResolver(req)
      .on('file', file => {
        stream.write(`${this.formatSingleModule(file)},`)
        moduleIds.push(file.resource.id)
      })
      .on('error', console.error.bind(console, '~ ERROR:'))
      .on('end', () => {
        const conclusion = ['}', '{}', JSON.stringify(moduleIds)].join(',')
        stream.write(`${conclusion})\n`)
      })
      .findAll()
  }

  formatModules (dependencies) {
    return `{${dependencies.map(this.formatSingleModule.bind(this)).join(',')}}`
  }

  formatSingleModule (file) {
    return [
      JSON.stringify(file.resource.id),
      ':[',
      'function(require,module,exports){\n',
      this.getSource(file),
      '\n},',
      '{' + Object.keys(file.dependencies || {}).sort().map(function (key) {
        return JSON.stringify(key) + ':' + JSON.stringify(file.dependencies[key])
      }).join(',') + '}',
      ']'
    ].join('')
  }

  getSource (file) {
    const wrapSource = () => {
      const filename = '/' + path.relative(this.baseDir, file.resource.absPath)
      const dirname = path.dirname(filename)

      return [
        '(function(__filename,__dirname){',
        file.source,
        '}).call(this,"' + filename + '","' + dirname + '")'
      ].join('\n')
    }

    // This can produce false positives...
    const needsNames = file.source.includes('__dirname') || file.source.includes('__filename')
    return needsNames ? wrapSource() : file.source
  }
}

class DependencyResolver extends EventEmitter {
  constructor (entry) {
    super()

    assert.ok(entry instanceof RequireStatement)
    this.entry = entry

    // abs path -> Resource
    this.resourceMap = {}

    // still need to resolve into Files
    this._newResources = []
    this.nextId = 0
  }

  findAll (cb = noop) {
    this._findDependencies([this.entry], (error, deps) => {
      if (error) {
        cb(error)
        this.emit('error', error)
        return
      }

      this._handleNewResources(error => {
        if (error) {
          cb(error)
        } else {
          this.emit('end')
          cb(null)
        }
      })
    })
  }

  _findDependencies (reqStmts, cb) {
    contra.map(reqStmts, this._toDependency.bind(this), (error, dependencies) => {
      if (error) {
        cb(error)
      } else {
        cb(null, dependencies)
      }
    })
  }

  _toDependency (reqStmt, cb) {
    discoverAbsolutePath(reqStmt, (error, absPath) => {
      if (error) {
        cb(error)
      } else {
        const existingResource = !!this.resourceMap[absPath]

        const resource = existingResource
          ? this.resourceMap[absPath]
          : new Resource(absPath, this._getNextId())
        const dep = new Dependency(reqStmt, resource)

        if (!existingResource) {
          this.resourceMap[absPath] = resource
          this._newResources.push(resource)
        }

        cb(null, dep)
      }
    })
  }

  _handleNewResources (cb) {
    const toProcess = []
    while (this._newResources.length) {
      toProcess.push(this._newResources.pop())
    }

    contra.map(toProcess, this._resourceToFile.bind(this), (error, files) => {
      if (error) {
        cb(error)
        return
      }

      files.forEach(file => {
        assert.ok(file instanceof File)
        this.emit('file', file)
      })

      if (this._newResources.length) {
        this._handleNewResources(cb)
      } else {
        cb(null)
      }
    })
  }

  _resourceToFile (resource, cb) {
    fs.readFile(resource.absPath, 'utf-8', (error, source) => {
      if (error) {
        cb(error)
        return
      }

      if (resource.absPath.endsWith('.json')) {
        source = 'module.exports=' + source.trim()
      }

      if (source.startsWith('#!')) {
        source = '//' + source
      }

      if (browserBuiltins.process !== resource.absPath && source.includes('process')) {
        debug('injecting process', { resource })
        source = `(function (process) { ${source} })(require("process"))`
      }

      const ast = parser.parse(source)
      const reqs = findAllRequireStatements(
        path.dirname(resource.absPath),
        ast
      )

      this._findDependencies(reqs, (error, deps) => {
        if (error) {
          cb(error)
          return
        }

        const file = new File(
          resource,
          deps,
          source,
          ast
        )

        cb(null, file)
      })
    })
  }

  _getNextId () {
    return this.nextId++
  }
}

class RequireStatement {
  constructor (dir, value) {
    this.dir = dir
    // raw string like 'http' or '../my-file.json'
    this.value = value
  }
}

class Resource {
  constructor (absPath, id) {
    this.absPath = absPath
    this.id = id
  }
}

class Dependency {
  constructor (req, res) {
    this.req = req
    this.res = res
  }
}

class File {
  constructor (resource, dependencies, source, ast) {
    this.resource = resource
    this.dependencies = dependencies.reduce((store, dep) => {
      store[dep.req.value] = dep.res.id
      return store
    }, {})

    this.source = source
    this.ast = ast
  }
}

function isCoreModuleName (value) {
  return !!browserBuiltins[value]
}

// RequireStatement -> callback(Error) | callback(null, String)
function discoverAbsolutePath (reqStmt, callback) {
  assert.ok(reqStmt instanceof RequireStatement)

  const { dir, value } = reqStmt

  if (isCoreModuleName(value)) {
    callback(null, browserBuiltins[value])
    return
  }

  if (value.startsWith('./') || value.startsWith('/') || value.startsWith('../')) {
    fs.stat(path.join(dir, value), (error, stats) => {
      if (doesNotExistError(error) && !value.endsWith('.js') && !value.endsWith('.json')) {
        const withJsExtension = value + '.js'

        discoverAbsolutePath(new RequireStatement(dir, withJsExtension), (error, absPath) => {
          if (doesNotExistError(error)) {
            const withJsonExtension = value + '.json'
            discoverAbsolutePath(new RequireStatement(dir, withJsonExtension), callback)
          } else if (error) {
            callback(error)
          } else {
            callback(null, absPath)
          }
        })
      } else if (error) {
        callback(error)
      } else if (stats.isDirectory()) {
        discoverAsDirectory(reqStmt, callback)
      } else {
        callback(null, path.join(dir, value))
      }
    })
  } else {
    discoverAsNodeModule(reqStmt, callback)
  }
}

function discoverAsNodeModule (req, callback) {
  const { value, dir } = req
  resolve(value, {
    basedir: dir
  }, function (error, modulePath) {
    if (error) {
      callback(error)
    } else {
      const dir = path.dirname(modulePath)
      const value = './' + path.basename(modulePath)

      discoverAbsolutePath(new RequireStatement(dir, value), callback)
    }
  })
}

function discoverAsDirectory (reqStmt, callback) {
  const { value, dir } = reqStmt

  const pkgPath = path.resolve(dir, value, 'package.json')

  fs.open(pkgPath, 'r', (error, fd) => {
    if (doesNotExistError(error)) {
      discoverAbsolutePath(
        new RequireStatement(path.join(dir, value), './index.js'),
        callback
      )
    } else if (error) {
      callback(error)
    } else {
      fs.close(fd, (error) => {
        if (error) {
          callback(error)
        } else {
          const pkg = require(pkgPath)
          const newDir = path.join(dir, value)
          let newValue = pkg.main || 'index.js'

          if (!newValue.startsWith('./')) {
            newValue = './' + newValue
          }

          discoverAbsolutePath(
            new RequireStatement(newDir, newValue),
            callback
          )
        }
      })
    }
  })
}

function findAllRequireStatements (dir, ast) {
  const statements = []

  walk.simple(ast, {
    CallExpression (node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        statements.push(new RequireStatement(dir, node.arguments[0].value))
      }
    }
  })

  return statements
}

function doesNotExistError (error) {
  return error && error.code === 'ENOENT'
}
