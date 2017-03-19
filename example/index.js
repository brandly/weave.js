const url = require('url')
const other = require('./other')

console.log('index', __dirname, __filename)
console.log(other())
console.log('protocol:', url.parse(window.location.href).protocol)

// here's a react app
const render = require('react-dom').render
const React = require('react')
const el = React.createElement
const NoteList = require('./NoteList')
const initialNotes = require('./notes')

const App = React.createClass({
  getInitialState () {
    return {
      noteInProgress: '',
      notes: initialNotes
    }
  },

  addNote () {
    this.setState({
      noteInProgress: '',
      notes: this.state.notes.concat([{
        text: this.state.noteInProgress
      }])
    })
  },

  render () {
    const notes = this.state.notes
    const noteInProgress = this.state.noteInProgress
    const that = this

    return el('div', null, [
      el('form', {
        key: 'add-note-form',
        onSubmit: function (e) {
          e.preventDefault()
          that.addNote()
        }
      }, [
        el('input', {
          key: 'new-note',
          type: 'text',
          value: noteInProgress,
          onChange: function (e) {
            that.setState({
              noteInProgress: e.target.value
            })
          }
        }),
        el('input', {
          key: 'add-btn',
          type: 'submit',
          onChange: function (e) {
            that.setState({
              noteInProgress: e.target.value
            })
          }
        })
      ]),
      el(NoteList, {
        key: 'list',
        notes: notes
      })
    ])
  }
})

render(el(App), document.getElementById('main'))
