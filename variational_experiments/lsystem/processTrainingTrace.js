// Replay a trace, which is given as an ordered list of ERP values
// Save per-callsite data

var _ = require('underscore');
var fs = require('fs');
var Canvas = require('canvas');
var md5 = require('md5');
var syscall = require('child_process').execSync;
var util = require('util');

module.exports = function(env) {

	function ProcessTrainingTrace(s, k, a, wpplFn, trace, dataDir) {
		this.s = s;
		this.k = k;
		this.a = a;
		this.wpplFn = wpplFn;
		this.trace = trace;
		this.traceIndex = 0;
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
		var imgDir = this.dataDir + '/img';
		if (!fs.existsSync(imgDir)) {
			fs.mkdirSync(imgDir);
		}

		// Save the images to the img directory
		// Files are named with MD5 checksums, so if two images happen to be identical, they will
		//    end up in the same file.
		var tmpCanvas = null;
		for (var i = 0; i < this.callsiteData.length; i++) {
			var data = this.callsiteData[i];
			// If the img hasn't changed from the last callsite, we just grab
			//    that callsite's image hash (see else branch)
			if (i === 0 || data.img !== this.callsiteData[i-1].img) {
				var img = data.img;
				if (tmpCanvas === null) {
					tmpCanvas = new Canvas(img.width, img.height);
				}
				img.copyToCanvas(tmpCanvas);
				var contents = tmpCanvas.toBuffer()
				var hash = md5(contents);
				var fullname = imgDir + '/' + hash + '.png';
				fs.writeFileSync(fullname, contents);
				// Convert to grayscale
				syscall(util.format('convert %s -colorspace Gray %s', fullname, fullname));
				data.imgHash = hash;
			} else {
				data.imgHash = this.callsiteData[i-1].imgHash;
			}
		}

		// Now actually prepare the JSON object that we'll serialize
		var traceData = {
			target: s.target.shortname,
			calls: this.callsiteData.map(function(data) {
				return {
					callsite: data.callsite,
					erp: data.erp.score.name.slice(0, -5),	// e.g. 'gaussianScore' -> 'gaussian'
					params: data.params,
					val: data.val,
					features: data.features,
					img: data.imgHash
				};
			})
		};

		// Save to file
		var traceFile = this.dataDir + '/traceData.txt';
		fs.appendFileSync(traceFile, JSON.stringify(traceData) + '\n');

		return this.k(this.s);
	}

	return function(s, k, a, wpplFn, trace, dataDir) {
		return new ProcessTrainingTrace(s, k, a, wpplFn, trace, dataDir).run();
	};

}




