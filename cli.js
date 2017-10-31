#!/usr/bin/env node
'use strict'

var meow = require('meow')
var Weave = require('./')

var cli = meow({
  help: [
    'Usage',
    '  weave <entry>',
    '',
    'Example',
    '  weave index.js',
    ''
  ].join('\n')
})

const entry = cli.input[0]

if (!entry) {
  console.error('Please supply an entry file')
  process.exit(1)
}

new Weave({ entry }).bundle(process.stdout)
