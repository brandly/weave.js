const other = require('./other')
const deep = require('./deep')
const async = require('async')
const _ = require('lodash')
const url = require('url')

// look at this sick program
function a () {
  return function () {
    console.log('hmm')
  }
}

_.forEach([a], function (b) { b()() })
console.log(other())

console.log(typeof async)
deep()

console.log('protocol:', url.parse(window.location.href).protocol)
