
var _ = require('underscore');
var fs = require('fs');
var util = require('util');
var assert = require('assert');
var webppl = require('../src/main.js');


// Inclusive
function makeRange(start, end, incr, reps) {
	reps = reps || 1;
	var arr = [];
	for (var i = start; i <= end; i += incr)
		for (var j = 0; j < reps; j++)
			arr.push(i);
	return arr;
}


// Run a webppl program
// config is:
//   - code: webppl code.
//   - file: File to load code from, if 'code' is undefined.
//   - params: object containing name->value mapping of constant params
//        to be inserted at the head of the file as an object called __params__.
//   - processReturn: function that turns the program's return value into a list of key/value
///       store objects. These are rows of data to be (eventually) written to a CSV file.
function run(config, callback) {
	assert(config.code || config.file, 'run: config must specify either code or file.');
	assert(config.processReturn, 'run: config must specify the processReturn function.')

	var code = config.code || fs.readFileSync(config.file);

	var paramPrefix = '';
	if (config.params !== undefined) {
		paramPrefix = util.format('var __params__ = %s;\n\n', JSON.stringify(config.params));
	}
	code = paramPrefix + code + '\n';

	// Compile code and turn it into executable function
	var compiledCode = webppl.compile(code);
	var progfn = eval(compiledCode);

	// Run with top continuation
	function topK(s, retval) {
		if (callback !== undefined) {
			var lst = config.processReturn(retval);
			assert(_.isArray(lst), 'run: processReturn must return an array');
			callback(lst);
		}
	}

	if (config.catchExceptions) {
		// Wrap in a loop that tries this until it succeeds, in case the
		//    progfn throws an exception
		function go() {
			var success = true;
			try {
				progfn({}, topK, '');
			} catch (e) {
				success = false;
			} finally {
				return success;
			}
		}
		do {
			var success = go();
		} while(!success);
	} else {
		progfn({}, topK, '');
	}
}

function objmerge(obj1, obj2) {
	return _.extend(_.clone(obj1), obj2);
}

// Run something multiple times, varying the value of some parameter
// If specified, the 'convertValue' transforms the values before they are passed to 'callback'
function varying(varyingName, varyingValues, config, callback, fn, convertValue) {
	var origparams = config.params;
	console.log('varying parameter "' + varyingName + '" by values ' + varyingValues);
	for (var i = 0; i < varyingValues.length; i++) {
		var value = varyingValues[i];
		console.log(varyingName + ' = ' + value);
		config.params = _.clone(config.params);
		config.params[varyingName] = value;
		fn(config, function(rows) {
			var convVal = (convertValue === undefined) ? value : convertValue(value);
			callback(rows.map(function(row) {
				var newdata = {}; newdata[varyingName] = convVal;
				return objmerge(row, newdata);
			}))
		});
	}
	config.params = origparams;
}
function makeVarying(varyingName, varyingValues, fn, convertValue) {
	return function(config, callback) {
		varying(varyingName, varyingValues, config, callback, fn, convertValue);
	};
}


// Run something and save the results to a CSV file
function csv(file, headerLabels, config, callback, fn) {
	console.log('Opening CSV file "' + file '"');
	var f = fs.openSync(file, 'w');
	fs.writeSync(f, headerLabels.toString() + '\n');
	fn(config, function(rows) {
		for (var r = 0; r < rows.length; r++) {
			var row = rows[r];
			// Check if this row is meant for this file or not
			if (row.__file__ === undefined || row.__file__ === file) {
				var writerow = [];
				for (var i = 0; i < headerLabels.length; i++) {
					var name = headerLabels[i];
					assert(row.hasOwnProperty(name), 'csv: row received has no property "' + name + '"');
					writerow.push(row[name].toString());
				}
				fs.writeSync(f, writerow.toString() + '\n');
			}
		}
		if (callback !== undefined) {
			callback(rows);
		}
	})
	fs.closeSync(f);
}
function makeCsv(file, headerLabels, fn) {
	return function(config, callback) {
		csv(file, headerLabels, config, callback, fn);
	};
}


module.exports = {
	range: makeRange,
	run: run,
	varying: makeVarying,
	csv: makeCsv
};

