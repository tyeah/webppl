var fs = require('fs');
var present = require('present');
var utils = require('../../utils.js');

// Parse options
var opts = require('minimist')(process.argv.slice(2));
var outputName = opts.output;
assert(outputName, 'Must define --output option');
console.log('Output name = ' + outputName);

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
	var targetIdx = Math.floor(Math.random() * targetDB.numTargets());
	globalStore.target = targetDB.getTargetByIndex(targetIdx);
	var MAPtrace;
	utils.runwebppl(ParticleFilter, [generate, 300], globalStore, '', function(s, ret) {
		MAPtrace = ret.MAPparticle.trace;
	});
	var outTrace = [targetIdx].concat(MAPtrace);
	fs.appendFileSync(filename, JSON.stringify(outTrace) + '\n');
	var t = present();
	var rate = counter / ((t - t0)/60000);
	console.log('Generated trace ' + counter + ' (curr avg rate: ' + rate + ' per min)');
	counter++;
}