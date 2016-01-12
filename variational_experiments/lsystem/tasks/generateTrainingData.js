// Generate training data
// You can run multiple instances of this task in parallel to generate
//    data faster.
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --outputName=name: Writes output traces to gen_traces/name.txt
// * --targetName=name: Only generates traces for targets/training/name.png
//   [Optional] If omitted, will generate for all target images
// * --sampler=[smc|mh]: Which sampling algorithm to use
//   [Optional] Defaults to smc

var fs = require('fs');
var present = require('present');
var utils = require('../../utils.js');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		numParticles: 600,
		sampler: 'smc'
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var outputName = opts.outputName;
assert(outputName, 'Must define --outputName option');
console.log(opts);

var gen_traces = __dirname + '/../gen_traces';

// Initialize
var file = __dirname + '/../programs/' + program + '.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generate = rets.generate;
var targetDB = rets.targetDB;

if (!fs.existsSync(gen_traces)) {
	fs.mkdirSync(gen_traces);
}
var filename = gen_traces + '/' + outputName + '.txt';

// Add line at the top with target dataset name, if the file hasn't been created yet
// (If there is no targetDB, then just put a dummy line there)
if (!fs.existsSync(filename)) {
	var dataset = '[No dataset]'
	if (targetDB) {
		var toks = targetDB.directory.split('/');
		dataset = toks[toks.length-1];
	}
	fs.appendFileSync(filename, dataset);
	fs.appendFileSync(filename, '\n');
}

var t0 = present();
var counter = 1;
while (true) {
	if (targetDB) {
		if (opts.targetName) {
			// Optionally, we can only generate for a single target
			globalStore.target = targetDB.getTargetByName(opts.targetName);
		} else {
			// Generate for a random target, recording the target index as the first
			//    random choice in the trace so that playback can work correctly.
			var targetIdx = Math.floor(Math.random() * targetDB.numTargets());
			globalStore.target = targetDB.getTargetByIndex(targetIdx);	
		}
	}
	var MAPtrace;
	if (opts.sampler === 'smc') {
		utils.runwebppl(ParticleFilter, [generate, opts.numParticles, true, false, true], globalStore, '', function(s, ret) {
			MAPtrace = ret.MAPparticle.trace;
		});
	} else if (opts.sampler === 'mh') {
		var mhOpts = { justSample: true, onlyMAP: true };
		utils.runwebppl(HashMH, [generate, opts.numParticles, mhOpts], globalStore, '', function(s, ret) {
			MAPtrace = ret.MAP.trace;
		});
	} else {
		throw 'Unrecognized sampler ' + opts.sampler;
	}
	var outTrace = MAPtrace;
	if (targetDB) {
		outTrace = [globalStore.target.index].concat(outTrace);
	}
	fs.appendFileSync(filename, JSON.stringify(outTrace) + '\n');
	var t = present();
	var rate = counter / ((t - t0)/60000);
	console.log('Generated trace ' + counter + ' (avg rate: ' + rate + ' per min)');
	counter++;
}