#!/usr/bin/env node
'use strict'

var meow = require('meow')
var weave = require('./')
var tree = require('./dependency-tree')

var cli = meow({
  help: [
    'Usage',
    '  weave <entry>',
    '  weave <entry> --view-tree',
    '',
    'Example',
    '  weave index.js',
    '  weave index.js --view-tree',
    '',
    'Options',
    '  --view-tree View full dependency tree'
  ].join('\n')
})

const entry = cli.input[0]

if (!entry) {
  console.error('Please supply an entry file')
  process.exit(1)
}

weave({ entry, viewTree: cli.flags.viewTree })
