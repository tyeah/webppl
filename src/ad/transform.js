'use strict';

var fs = require('fs');
var sweet = require('sweet.js');


var macros = fs.readFileSync('./src/ad/macros.js');
var adMainFile = __dirname + '/main.js';
function transform(code) {
	var allcode = macros + '\n' + code;
	var compiled = sweet.compile(allcode, {readableNames: true});
	return "var __AD__ = require('" + adMainFile + "');\n\n" + compiled.code;
}

module.exports = {
	transform: transform
}
