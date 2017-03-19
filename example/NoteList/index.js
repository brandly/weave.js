const React = require('react')
const el = React.createElement

console.log('NoteList', __dirname, __filename)

module.exports = React.createClass({
  render: function () {
    const notes = this.props.notes
    return el('ul', null, notes.map(function (note, index) {
      return el('li', { key: index }, note.text)
    }))
  }
})
