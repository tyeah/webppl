// Evaluate the performance of particle filters using either the prior or a
//    trained guide program
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --trainedModel=name: Looks for saved_params/name.txt.
//   [Optional] If omitted, will use the prior.
// * --outputName=name: Writes output .csv to performance_eval/name.txt.
//   [Optional] Defaults to the value of --trainedModel, or 'prior' if there
//      trained model provided.
// * --testDir=name: Tests on targets/datasets/testDir/*.png 
//	[Optional] Defaults to every other image in targetDB specified in the .wppl file. 
// * --targetName=name: Only tests on targets/training/name.png
//   [Optional] If omitted, will test on all target images
// * --numReps=num: Tests on num images. 
//	[Optional] If separate test database specified, defaults to the size of the test image database. 
// Otherwise, default is 49.  
// * --sampler=[smc|mh]: Which sampling algorithm to use
//   [Optional] Defaults to smc


var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');
var util = require('util');
var present = require('present');
var lsysUtils = require('../utils.js');
var nnarch = require('../nnarch');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		start: 1,
		end: 10,
		incr: 1,
		numReps: 49,
		sampler: 'smc'
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var trainedModel = opts.trainedModel;
var testDir = opts.testDir;
var outputName = opts.outputName || trainedModel || 'prior';
console.log(opts);


var saved_params = __dirname + '/../saved_params';
var performance_eval = __dirname + '/../performance_eval';
if (!fs.existsSync(performance_eval)) {
	fs.mkdirSync(performance_eval);
}


// Initialize
var file = __dirname + '/../programs/' + program + '.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var viewport = rets.viewport;
var testDB = rets.targetDB;

if (testDir) {
	testDB = utils.new(lsysUtils.TargetImageDatabase, __dirname + '/../targets/datasets/' + testDir);
}

var generate = trainedModel ? rets.generateGuided : rets.generate;


// Load trained networks?
if (trainedModel) {
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	var nnGuide = nnarch.loadFromFile(paramfile);
	globalStore.nnGuide = nnGuide;
}


var numReps = opts.numReps;
// If there is a targetDB, define list of target images we will test on
// Else, just leave this blank
var testlist = [];
if (testDB) {
	if (opts.targetName) {
		// The same target, numReps times
		for (var i = 0; i < numReps; i++) {
			testlist.push(testDB.getTargetByName(opts.targetName).index);
		}
	} else if (!testDir) { //no separate test directory
		// Every other image in our 98-image training set
		// TODO: A proper, separate test set
		for (var i = 0; i < numReps; i++) {
			testlist.push(2*i);
		}
	}
	else { //separate test directory has been specified
		numReps = testDB.numTargets();
		for (var i = 0; i < numReps; i++) {
			testlist.push(i);
		}
	}

}


// Run evaluation, generate CSV
var outfilename = performance_eval + '/' + outputName + '.csv';
var outfile = fs.openSync(outfilename, 'w');
fs.writeSync(outfile, 'numParticles,sim,time,avgTime,length,normTime,avgNormTime\n');
var warmUp = true;
// var warmUp = false;
for (var i = opts.start; i <= opts.end; i += opts.incr) {
	var np = i;
	// We run through all test targets once, just to make sure everything is warmed
	//    up (JIT, precomputation, etc.)
	if (warmUp) {
		console.log('Warming up...');
	}
	if (!warmUp) {
		console.log('numParticles = ' + np);
	}
	var times = [];
	var sims = [];
	var lengths = [];
	var normTimes = [];
	for (var j = 0; j < numReps; j++) {
		if (!warmUp) {
			console.log('  test ' + (j+1));
		}
		if (testDB) {
			var targetIdx = testlist[j];
			globalStore.target = testDB.getTargetByIndex(targetIdx);	
		}
		var t0 = present();
		var retval;
		var sim;
		if (opts.sampler === 'smc') {
			utils.runwebppl(ParticleFilter, [generate, np, true, false, true], globalStore, '', function(s, ret) {
				retval = ret.MAPparticle.value;
				sim = ret.MAPparticle.store.sim;
			});
		} else if (opts.sampler === 'mh') {
			var mhOpts = { justSample: true, onlyMAP: true };
			utils.runwebppl(HashMH, [generate, np, mhOpts], globalStore, '', function(s, ret) {
				retval = ret.MAP.value;
				sim = ret.MAP.store.sim;
			});
		} else {
			throw 'Unrecognized sampler ' + opts.sampler;
		}
		var t1 = present();
		var time = (t1 - t0)/1000;
		times.push(time);
		sims.push(sim);
		lengths.push(retval.n);
		normTimes.push(time / (retval.n * np));
	}
	if (!warmUp) {
		// We use median time as our measure of average, since it's less sensitive
		//    to outliers than mean.
		var sortedTimes = times.slice(); sortedTimes.sort();
		var avgTime = sortedTimes[Math.floor(sortedTimes.length/2)];
		var sortedNormTimes = normTimes.slice(); sortedNormTimes.sort();
		var avgNormTime = sortedNormTimes[Math.floor(sortedNormTimes.length/2)];
		for (var j = 0; j < numReps; j++) {
			var sim = sims[j];
			var time = times[j];
			var length = lengths[j];
			var normTime = normTimes[j];
			fs.writeSync(outfile, util.format('%d,%d,%d,%d,%d,%d,%d\n',
				np, sim, time, avgTime, length, normTime, avgNormTime));
		}
	}
	if (warmUp) {
		warmUp = false;
		i -= opts.incr;
	}
}
fs.closeSync(outfile);



