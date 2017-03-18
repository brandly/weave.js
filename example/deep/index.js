const data = require('./data')

console.log('deep', __dirname, __filename)

module.exports = function deep () {
  console.log(data.message)
}
