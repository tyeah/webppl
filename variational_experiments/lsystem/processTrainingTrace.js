// Replay a trace, which is given as an ordered list of ERP values
// Save per-callsite data

var _ = require('underscore');
var fs = require('fs');
var md5 = require('md5');

module.exports = function(env) {

	function ProcessTrainingTrace(s, k, a, wpplFn, trace, imgData, traceData) {
		this.s = s;
		this.k = k;
		this.a = a;
		this.wpplFn = wpplFn;
		this.trace = trace;
		this.traceIndex = 0;
		this.imgData = imgData;
		this.traceData = traceData;

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
			var dataEntry = {
				callsite: callsite,
				erp: erp,
				params: params,
				val: val,
				features: s.currFeatures,
				img: s.genImg
			};
			this.callsiteData.push(dataEntry);
		}
		return k(s, val);
	}

	ProcessTrainingTrace.prototype.factor = function(s, k, a, score) {
		return k(s);
	}

	ProcessTrainingTrace.prototype.exit = function(s, retval) {
		// NOTE: I originally had this writing to disk (by file append) after every
		//    trace, but that started to really slow down about half-way through.

		// Save one-bit-per-pixel images to a binary blob
		// We MD5 hash the images and only store the unique ones
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
				if (!this.imgData.hasOwnProperty(hash)) {
					this.imgData[hash] = buf;
				}
			} else {
				data.imgHash = this.callsiteData[i-1].imgHash;
			}
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
		this.traceData.push(traceDatum);

		return this.k(this.s);
	}

	function PTT(s, k, a, wpplFn, trace, imgData, traceData) {
		return new ProcessTrainingTrace(s, k, a, wpplFn, trace, imgData, traceData).run();
	};

	PTT.saveToDisk = function(dataDir, imgData, traceData) {
		var traceFileName = dataDir + '/trace.txt';
		var imgHashFileName = dataDir + '/img.txt';
		var imgDataFileName = dataDir + '/img.dat';
		var traceFile = fs.openSync(traceFileName, 'w');
		var imgHashFile = fs.openSync(imgHashFileName, 'w');
		var imgDataFile = fs.openSync(imgDataFileName, 'w');

		for (var hash in imgData) {
			fs.writeSync(imgHashFile, hash + '\n');
			fs.writeSync(imgDataFile, imgData[hash]);
		}
		for (var i = 0; i < this.traceData.length; i++) {
			fs.writeSync(traceFile, JSON.stringify(this.traceData[i]) + '\n');
		}
	};

	return PTT;

}




