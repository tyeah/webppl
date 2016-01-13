// In very specific cases, this can be used to convert a set of traces that were generated
//    using 'uniformFromDeepest' future policy to traces that are compatible with the
//    'immediate' future policy.

var fs = require('fs');
var assert = require('assert');

var opts = require('minimist')(process.argv.slice(2));
var input = opts.input;
assert(input, 'Must define --input option');
var output = opts.output;
assert(output, 'Must define --output option');

var lines = fs.readFileSync(input).toString().split('\n');
for (var i = 0; i < lines.length; i++) {
	var line = lines[i];
	var toks = line.split(',');
	var filtertoks = toks.filter(function(s) {
		return s !== '0';
	});
	lines[i] = filtertoks.join(',');
}
var outstr = lines.join('\n');
fs.writeFileSync(output, outstr);