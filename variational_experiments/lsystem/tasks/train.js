var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');


// Parse options
var opts = require('minimist')(process.argv.slice(2));
var trainingTraces = opts.trainingTraces;
assert(trainingTraces, 'Must define --trainingTraces option');
var outputName = opts.output || trainingTraces;
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
	convergeEps: 0.01,
	adagradInitLearnRate: 0.1,
	gradientEstimator: 'EUBO',
	exampleTraces: utils.loadTraces(filename),
	verbosity: {
		flightNum: true,
		time: true,
		guideScore: true,
		endStatus: true,

		// params: true,
		// gradientEstimate: true
	},
	warnOnZeroGradient: true
};

// var trainingStore = _.extend(_.clone(globalStore), {
// 	// With EUBO training, we don't need the target score at all, so we can avoid
// 	//    computing factors and speed things up.
// 	// (This is only true if we're doing the recurrent version that doesn't
// 	//	   need to render anything).
// 	noFactors: true
// });
var trainingStore = globalStore;
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
	console.log('FINISHED writing neural nets/params to disk');
});