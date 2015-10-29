var fs = require('fs');

function loadTraces(filename) {
	var lines = fs.readFileSync(filename).toString().split('\n');
	if (lines[lines.length-1] === '') {
		lines.splice(lines.length-1, 1);
	}
	return lines.map(function(line) {
		return JSON.parse(line);
	});
}

// Call a webppl function from js code by setting up our own trampoline
var runwebppl = function(fn, args, store, address, continuation) {
	continuation = continuation || function() {};
	address = address || '';
	store = store || {};
	args = args || [];
	var allargs = [store, continuation, address].concat(args);
	var trampoline = fn.apply(null, allargs);
	while(trampoline) {
		trampoline = trampoline();
	}
}

module.exports = {
	loadTraces: loadTraces,
	runwebppl: runwebppl
};