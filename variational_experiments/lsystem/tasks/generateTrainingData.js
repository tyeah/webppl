// Generate training data
// You can run multiple instances of this task in parallel to generate
//    data faster.
// Command line arguments:
// * --outputName=name: Writes output traces to gen_traces/name.txt
// * --targetName=name: Only generates traces for targets/training/name.png
//   [Optional] If omitted, will generate for all target images

var fs = require('fs');
var present = require('present');
var utils = require('../../utils.js');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		numParticles: 300
	}
});
var outputName = opts.outputName;
assert(outputName, 'Must define --outputName option');
console.log(opts);

var gen_traces = __dirname + '/../gen_traces';

// Initialize
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generate = rets.generate;
var targetDB = rets.targetDB;

if (!fs.existsSync(gen_traces)) {
	fs.mkdirSync(gen_traces);
}
var filename = gen_traces + '/' + outputName + '.txt';
var t0 = present();
var counter = 1;
while (true) {
	// Generate for a random target, recording the target index as the first
	//    random choice in the trace so that playback can work correctly.
	if (opts.targetName) {
		// Optionally, we can only generate for a single target
		globalStore.target = targetDB.getTargetByName(opts.targetName);
	} else {
		var targetIdx = Math.floor(Math.random() * targetDB.numTargets());
		globalStore.target = targetDB.getTargetByIndex(targetIdx);	
	}
	var MAPtrace;
	utils.runwebppl(ParticleFilter, [generate, opts.numParticles], globalStore, '', function(s, ret) {
		MAPtrace = ret.MAPparticle.trace;
	});
	var outTrace = [globalStore.target.index].concat(MAPtrace);
	fs.appendFileSync(filename, JSON.stringify(outTrace) + '\n');
	var t = present();
	var rate = counter / ((t - t0)/60000);
	console.log('Generated trace ' + counter + ' (curr avg rate: ' + rate + ' per min)');
	counter++;
}