'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var rollupPluginutils = require('rollup-pluginutils');
var path = require('path');
var MagicString = _interopDefault(require('magic-string'));
var acorn = _interopDefault(require('acorn-jsx'));
var estreeWalker = require('estree-walker');

/**
 * Creates a filter for the options `include`, `exclude`, and `extensions`.
 * Since `extensions` is not a rollup option, I think is widely used.
 *
 * @param {object} opts? - The user options
 * @returns {function}     Filter function that returns true if a given
 *                         file matches the filter.
 */
function _createFilter (opts) {

  var filt = rollupPluginutils.createFilter(opts.include, opts.exclude)

  var exts = opts.extensions || ['.js', '.jsx']
  if (!Array.isArray(exts)) exts = [exts]
  for (var i = 0; i < exts.length; i++) {
    var e = exts[i]
    if (e === '*') {
      exts = '*'
      break
    } else if (e[0] !== '.') {
      exts[i] = '.' + e
    }
  }

  return function (name) {
    return filt(name) && (exts === '*' || exts.indexOf(path.extname(name)) > -1)
  }
}

function removeLines (magicString, code, file, options) {
  var whitespace = /\s/
  var ast
  var changed = false

  function remove (start, end) {
    while (whitespace.test(code[start - 1])) start -= 1
    magicString.remove(start, end)
  }
  
  try {
    ast = acorn.parse( code, {
      ecmaVersion: 6,
      sourceType: 'module',
      plugins: {
        jsx: true
      }
    })
  } catch ( err ) {
    this.warn( 'stripPropTypes parse error' )
    err.message += " in " + file
    throw err
  }

  estreeWalker.walk( ast, {
    enter: function enter (node, parent) {
      Object.defineProperty( node, 'parent', {
        value: parent,
        enumerable: false
      })

      if (options.sourceMap) {
        magicString.addSourcemapLocation(node.start)
        magicString.addSourcemapLocation(node.end)
      }

      // strip away import or require
      if (node.type === 'Literal' && node.value === 'prop-types') {
        if (node.parent.type === 'ImportDeclaration') { // remove ES6 import
          remove(node.parent.start, node.parent.end)
        } else { // remove require
          var tmpNode = node.parent
          while (tmpNode.parent.type !== 'Program') { // reach the variable declaration level
            tmpNode = tmpNode.parent
          }
          remove(tmpNode.start, tmpNode.end)
        }
      }

      // strip away propTypes or defaultProps definitions
      if (node.type === 'ExpressionStatement' && 
          node.expression.type === 'AssignmentExpression' &&
          node.expression.left.property &&
         (node.expression.left.property.name === 'propTypes' ||
          node.expression.left.property.name === 'defaultProps')) {
        remove( node.start, node.end )
        changed = true
      }
    }
  })

  return changed

}

function cleanup (source, file, options) {
  var firstpass = new RegExp( '\\b(?:propTypes|prop-types)\\b' )
  
  // the file doesn't contain propTypes
  if (!firstpass.test(source)) return null

  
  var magicString = new MagicString(source)

  var changes = removeLines(magicString, source, file, options)

  return changes
    ? {
      code: magicString.toString(),
      map: options.sourceMap ? magicString.generateMap({ hires: true }) : null
    }
    : null   // tell to Rollup that discard this result
}

function stripPropTypes ( options ) {
  if ( options === void 0 ) options = {};


  if (!options) options = {}
	
	// merge include, exclude, and extensions
  var filter = _createFilter(options)

  options.sourceMap = options.sourceMap !== false && options.sourcemap !== false

  return {
    name: 'stripPropTypes',

    transform: function transform ( code, id ) {

      if (filter(id)) {
        return cleanup(code, id, options)
      }

      return null
    }
  }
}

module.exports = stripPropTypes;