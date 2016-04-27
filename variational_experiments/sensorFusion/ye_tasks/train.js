// Train neurally-guided model
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --trainingTraces=name: Trains on traces in gen_traces/name.txt
// * --arch=name: Name of neural guide architecture, looks in nnarch/architectures
// * --outputName=name: Writes output neural nets to saved_params/name.txt
//   [Optional] If omitted, will use value of --arch
// * --numIters=num: Number of training iterations
//   [Optional] Defaults to 20000
// * --numTraces=num: Trains on a random subset of num traces
//   [Optional] If omitted, will use all training traces


var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');
//var utils = require('../../ye_utils.js');
var nnarch = require('../ye_nnarch');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		numIters: 1000
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var trainingTraces = opts.trainingTraces;
assert(trainingTraces, 'Must define --trainingTraces option');
var arch = opts.arch;
assert(arch, 'Must define --arch option');
//var ArchType = nnarch.getArchByName(arch);
var ArchType = nnarch.getArchByName(opts.arch);
var outputName = opts.outputName || arch;
console.log(opts);

var gen_traces = __dirname + '/../ye_data';
var saved_params = __dirname + '/../ye_params';


// Initialize
var file = __dirname + '/../ye_programs/' + program + '.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generateGuided = rets.generateGuided;


// Load traces
var filename = gen_traces + '/' + trainingTraces + '.txt';
var traces = utils.loadTraces(filename);
//console.log(traces[0]);//////////////////////////////////////////////////////////////////////// a list of lists of samples at each step
if (opts.numTraces) {
	assert(opts.numTraces <= traces.length,
		'--numTraces is bigger than the size of the trace file!');
	traces = traces.slice(0, opts.numTraces);
}

//console.log('!!!!');

var trainingOpts = {
	numParticles: 1,				// mini batch size
	maxNumFlights: opts.numIters,	// max number of mini-batches
	convergeEps: 0.001,
	gradientEstimator: 'EUBO',
	exampleTraces: traces,
	// gradientEstimator: 'ELBO',
	// optimizer: {
	// 	name: 'adagrad',
	// 	initLearnRate: 0.05
	// },
	// optimizer: {
	// 	name: 'windowgrad',
	// 	initLearnRate: 0.01,
	// 	blendWeight: 0.75
	// },
	// optimizer: {
	// 	name: 'adadelta',
	// 	blendWeight: 0.5
	// },
	optimizer: {
		name: 'adam',
		initLearnRate: 0.0005,
		blendWeight1: 0.75,
		blendWeight2: 0.75
	},
	// optimizer: {
	// 	name: 'sgd',
	// 	initLearnRate: 0.001,
	// 	decayFactor: 1
	// },
	verbosity: {
		flightNum: true,
		time: true,
		guideScoreAvg: 100,
		// scoreDiff: true,
		endStatus: true,

		// params: true,
		// gradientEstimate: true,
		// gradientSamples: true
	},
	warnOnZeroGradient: true
};

//console.log(0);
var nnGuide = new ArchType();
//console.log(nnGuide);
//console.log(ArchType.prototype);
//console.log(1);
nnGuide.setTraining(true);
globalStore.nnGuide = nnGuide;

console.log('Training...');
utils.runwebppl(Variational, [generateGuided, trainingOpts], globalStore, '', function(s, diagnostics) {
	console.log('FINISHED training.');

	// Save neural nets to disk
	if (!fs.existsSync(saved_params)) {
		fs.mkdirSync(saved_params);
	}
	var paramfile = saved_params + '/' + outputName + '.txt';
	nnGuide.saveToFile(paramfile);
	console.log('Wrote neural nets/params to disk.');

	// Save diagnostics to disk
	// (Find all properties of the diagnostics which are lists, write them as columns
	//    in a CSV file)
	var diagfile = saved_params + '/' + outputName + '_diagnostics.csv';
	var df = fs.openSync(diagfile, 'w');
	var lists = _.pick(diagnostics, function(val) { return _.isArray(val); });
	var propnames = Object.keys(lists);
	fs.writeSync(df, ['iteration'].concat(propnames).toString() + '\n');
	var n = lists[propnames[0]].length;
	for (var i = 0; i < n; i++) {
		var row = [i].concat(propnames.map(function(name) { return lists[name][i]; })).toString() + '\n';
		fs.writeSync(df, row);
	}
	fs.closeSync(df);
	console.log('Wrote diagnostics to file.');
});



