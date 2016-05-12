const other = require('./other')
const deep = require('./deep')
const async = require('async')
const _ = require('lodash')

// look at this sick program
function a () {
  return function () {
    console.log('hmm')
  }
}

_.forEach([a], (b) => b()())
console.log(other())

console.log(typeof async)
deep()
