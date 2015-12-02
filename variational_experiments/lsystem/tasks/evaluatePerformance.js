// Evaluate the performance of particle filters using either the prior or a
//    trained guide program
// Command line arguments:
// * --trainedModel=name: Looks for saved_params/name.txt. Otherwise, uses
//      the prior.
// * --outputName=name: Writes output .csv to performance_eval/name.txt.
//   [Optional] Defaults to the value of --trainedModel, or 'prior' if there
//      trained model provided.
// * --targetName=name: Only tests on targets/training/name.png
//   [Optional] If omitted, will test on all target images


var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');
var util = require('util');
var present = require('present');
var lsysUtils = require('../utils.js');
var render = require('../render.js');
var nnarch = require('../nnarch');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		start: 1,
		end: 10,
		incr: 1
	}
});
var trainedModel = opts.trainedModel;
var outputName = opts.outputName || trainedModel || 'prior';
console.log(opts);


var saved_params = __dirname + '/../saved_params';
var performance_eval = __dirname + '/../performance_eval';
if (!fs.existsSync(performance_eval)) {
	fs.mkdirSync(performance_eval);
}


// Initialize
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var viewport = rets.viewport;
var targetDB = rets.targetDB;
var generate = trainedModel ? rets.generateGuided : rets.generate;


// Load trained networks?
if (trainedModel) {
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	var nnGuide = nnarch.loadFromFile(paramfile);
	globalStore.nnGuide = nnGuide;
}


// Define list of target images we will test on
var testlist = [];
if (opts.targetName) {
	// The same target, 49 times
	for (var i = 0; i < 49; i++) {
		testlist.push(targetDB.getTargetByName(opts.targetName).index);
	}
} else {
	// Every other image in our 98-image training set
	// TODO: Evaluate each multiple times? (but that's so expensive...)
	for (var i = 0; i < 49; i++) {
		testlist.push(2*i);
	}
}
// TODO: A proper, separate test set
// TODO: Old, random target behavior?


// Run evaluation, generate CSV
var outfilename = performance_eval + '/' + outputName + '.csv';
var outfile = fs.openSync(outfilename, 'w');
fs.writeSync(outfile, 'numParticles,sim,time,avgTime,length,normTime,avgNormTime\n');
var img = new lsysUtils.ImageData2D();
for (var i = opts.start; i <= opts.end; i += opts.incr) {
	var np = i;
	console.log('  numParticles = ' + np);
	var times = [];
	var sims = [];
	var lengths = [];
	var normTimes = [];
	for (var j = 0; j < testlist.length; j++) {
		console.log('    repetition ' + (j+1));
		var targetIdx = testlist[j];
		globalStore.target = targetDB.getTargetByIndex(targetIdx);	
		var t0 = present();
		var retval;
		utils.runwebppl(ParticleFilter, [generate, np], globalStore, '', function(s, ret) {
			retval = ret.MAPparticle.value;
		});
		var t1 = present();
		var time = (t1 - t0)/1000;
		render.render(globalStore.target.canvas, viewport, retval);
		img.loadFromCanvas(globalStore.target.canvas);
		var sim = lsysUtils.normalizedSimilarity(img, globalStore.target);
		times.push(time);
		sims.push(sim);
		lengths.push(retval.n);
		normTimes.push(time / (retval.n * np));
	}
	// We use median time as our measure of average, since it's less sensitive
	//    to outliers than mean.
	var sortedTimes = times.slice(); sortedTimes.sort();
	var avgTime = sortedTimes[Math.floor(sortedTimes.length/2)];
	var sortedNormTimes = normTimes.slice(); sortedNormTimes.sort();
	var avgNormTime = sortedNormTimes[Math.floor(sortedNormTimes.length/2)];
	for (var j = 0; j < testlist.length; j++) {
		var sim = sims[j];
		var time = times[j];
		var length = lengths[j];
		var normTime = normTimes[j];
		fs.writeSync(outfile, util.format('%d,%d,%d,%d,%d,%d,%d\n',
			np, sim, time, avgTime, length, normTime, avgNormTime));
	}
}
fs.closeSync(outfile);



