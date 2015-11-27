// Process generated data into a form suitable for use by an external
//    neural net library.
// Command line arguments:
// * --trainingTraces=name: Trains on traces in gen_traces/name.txt
// * --outputName=name: Writes output neural nets to saved_params/name.txt
//   [Optional] If omitted, will use value of --trainingTraces


var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');


// Parse options
var opts = require('minimist')(process.argv.slice(2));
var trainingTraces = opts.trainingTraces;
assert(trainingTraces, 'Must define --trainingTraces option');
var outputName = opts.outputName || trainingTraces;
console.log(opts);

var gen_traces = __dirname + '/../gen_traces';
var saved_params = __dirname + '/../saved_params';


// Initialize
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generateGuided = rets.generateGuided;
var neuralNets = rets.neuralNets;


var filename = gen_traces + '/' + trainingTraces + '.txt';

var trainingOpts = {
	numParticles: 1,				// mini batch size
	maxNumFlights: 10000,			// max number of mini-batches
	convergeEps: 0.001,
	gradientEstimator: 'EUBO',
	exampleTraces: utils.loadTraces(filename),
	// optimizer: {
	// 	name: 'adagrad',
	// 	initLearnRate: 0.05
	// },
	optimizer: {
		name: 'windowgrad',
		initLearnRate: 0.01,
		blendWeight: 0.75
	},
	// optimizer: {
	// 	name: 'adadelta',
	// 	blendWeight: 0.5
	// },
	// optimizer: {
	// 	name: 'sgd',
	// 	initLearnRate: 0.001,
	// 	decayFactor: 1
	// },
	verbosity: {
		flightNum: true,
		time: true,
		// guideScore: true,
		guideScoreAvg: 100,
		endStatus: true,

		// params: true,
		// gradientEstimate: true
	},
	warnOnZeroGradient: true
};

var trainingStore = _.extend(_.clone(globalStore), {
	// // With EUBO training, we may not need to compute factors (if our neural
	// //    nets don't need access to the rendered image)
	// noFactors: true
});
console.log('Training...');
utils.runwebppl(Variational, [generateGuided, trainingOpts], trainingStore, '', function(s, diagnostics) {
	console.log('FINISHED training.');
	// Not doing anything with diagnostics for now

	// Save neural nets to disk
	if (!fs.existsSync(saved_params)) {
		fs.mkdirSync(saved_params);
	}
	var paramfile = saved_params + '/' + outputName + '.txt';
	var nets = _.mapObject(neuralNets, function(net) {
		return net.serializeJSON();
	});
	fs.writeFileSync(paramfile, JSON.stringify(nets));
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