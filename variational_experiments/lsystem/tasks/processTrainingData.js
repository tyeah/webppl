// Process generated data into a form suitable for use by an external
//    neural net library.
// Command line arguments:
// * --traces=name: Looks for gen_traces/name.txt
// * --outputName=name: Writes output to processed_data/name
//   [Optional] If omitted, will use value of --traces for name


var _ = require('underscore');
var fs = require('fs');
var md5 = require('md5');
var utils = require('../../utils.js');


// Inference coroutine that re-runs a trace and saves training data from it

function ProcessTrainingTrace(s, k, a, wpplFn, trace, imgHashes, dataDir) {
	this.s = s;
	this.k = k;
	this.a = a;
	this.wpplFn = wpplFn;
	this.trace = trace;
	this.traceIndex = 0;
	this.imgHashes = imgHashes;
	this.dataDir = dataDir;

	this.callsiteData = [];

	this.oldCoroutine = env.coroutine;
	env.coroutine = this;
}

ProcessTrainingTrace.prototype.run = function() {
	return this.wpplFn(_.clone(this.s), env.exit, this.a);
}

ProcessTrainingTrace.prototype.sample = function(s, k, a, erp, params) {
	var val = this.trace[this.traceIndex];
	this.traceIndex++;

	var addrparts = a.split('_');

	// Don't record data for stochastic future choices
	var dontRecord = addrparts[addrparts.length-1][0] === 'f';
	// Also don't record data for any choices that happen before 'currFeatures' is set
	// (this should only be the choice of target)
	dontRecord = dontRecord || s.currFeatures === undefined;
	if (!dontRecord) {
		// NOTE: This assumes the program doesn't call 'sample' directly...
		// (i.e. we assume the last address chunk is the call to 'sample' inside e.g. 'gaussian')
		var callsite = addrparts[addrparts.length-2];
		this.callsiteData.push({
			callsite: callsite,
			erp: erp,
			params: params,
			val: val,
			features: s.currFeatures,
			img: s.genImg
		});
	}
	return k(s, val);
}

ProcessTrainingTrace.prototype.factor = function(s, k, a, score) {
	return k(s);
}

ProcessTrainingTrace.prototype.exit = function(s, retval) {
	var traceFileName = this.dataDir + '/trace.txt';
	var imgHashFileName = this.dataDir + '/img.txt';
	var imgDataFileName = this.dataDir + '/img.dat';

	// Save one-bit-per-pixel images to a binary blob
	// We MD5 hash the images and only store the unique ones
	var newImgHashes = [];
	var newImgData = [];
	for (var i = 0; i < this.callsiteData.length; i++) {
		var data = this.callsiteData[i];
		// If the img hasn't changed from the last callsite, we just grab
		//    that callsite's image hash (see else branch)
		if (i === 0 || data.img !== this.callsiteData[i-1].img) {
			var img = data.img;
			var buf = new Buffer(img.toBinaryByteArray());
			var hash = md5(buf);
			data.imgHash = hash;
			// Only save this image if we haven't already saved one
			//    with the same hash (from a previous run)
			if (!this.imgHashes.hasOwnProperty(hash)) {
				this.imgHashes[hash] = true;
				newImgHashes.push(hash);
				newImgData.push(buf);
			}
		} else {
			data.imgHash = this.callsiteData[i-1].imgHash;
		}
	}
	if (newImgData.length > 0) {
		var hashConcat = '';
		for (var i = 0; i < newImgHashes.length; i++) {
			hashConcat += newImgHashes[i] + '\n';
		}
		var buflen = newImgData[0].length;
		var numDataBytes = buflen * newImgData.length;
		var dataBuf = new Buffer(numDataBytes);
		for (var i = 0; i < newImgData.length; i++) {
			newImgData[i].copy(dataBuf, i*buflen);
		}
		fs.appendFileSync(imgHashFileName, hashConcat);
		fs.appendFileSync(imgDataFileName, dataBuf);
	}

	// Save the trace data itself (as nested arrays instead of objects,
	//    since we're going to JSON serialize this and it'll take less space this way)
	var traceDatum = [
		s.target.shortname,
		this.callsiteData.map(function(data) {
			return [
				data.callsite,
				data.erp.score.name.slice(0, -5),	// e.g. 'gaussianScore' -> 'gaussian'
				data.params,
				data.val,
				data.features,
				data.imgHash
			];
		})
	];

	fs.appendFileSync(traceFileName, JSON.stringify(traceDatum) + '\n');

	// When replaying lots of traces, I was getting explosive memory use, which didn't make sense.
	// This fixes the problem, though I don't know why (I mean, shouldn't this array be GC'ed anyway?)
	this.callsiteData = undefined;

	env.coroutine = this.oldCoroutine;
	return this.k(this.s);
}

function processTrace(s, k, a, wpplFn, trace, imgHashes, dataDir) {
	return new ProcessTrainingTrace(s, k, a, wpplFn, trace, imgHashes, dataDir).run();
};

// ----------------------------------------------------------------------------

// Parse options
var opts = require('minimist')(process.argv.slice(2));
var traces = opts.trainingData;
assert(traces, 'Must define --traces option');
var outputName = opts.output || traces;
console.log(opts);

var gen_traces = __dirname + '/../gen_traces';
var processed_data = __dirname + '/../processed_data';


// Initialize
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generate = rets.generate;
var env = rets.environment;


var dataFileName = gen_traces + '/' + traces + '.txt';
var traces = utils.loadTraces(dataFileName);
if (!fs.existsSync(processed_data)) {
	fs.mkdirSync(processed_data);
}
var dataSubdir = processed_data + '/' + outputName;
if (!fs.existsSync(dataSubdir)) {
	fs.mkdirSync(dataSubdir);
}
var imgHashes = {};
for (var i = 0; i < traces.length; i++) {
	var trace = traces[i];
	utils.runwebppl(processTrace, [generate, trace, imgHashes, dataSubdir], globalStore);
	console.log('Processed trace ' + (i+1) + '/' + traces.length);
}


