var _ = require('underscore');
var fs = require('fs');
var utils = require('../../utils.js');

// TODO: read from commmand line?
var name = 'allTargets_uniformFromDeepest';


var gen_traces = __dirname + '/../gen_traces';
var saved_params = __dirname + '/../saved_params';


// Initialize
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generateGuided = rets.generateGuided;
var neuralNets = rets.neuralNets;


var filename = gen_traces + '/' + name + '.txt';

var trainingOpts = {
	numParticles: 1,				// mini batch size
	maxNumFlights: 1000,			// max number of mini-batches
	convergeEps: 0.01,
	adagradInitLearnRate: 0.25,
	gradientEstimator: 'EUBO',
	exampleTraces: utils.loadTraces(filename),
	verbosity: {
		flightNum: true,
		time: true,
		guideScore: true,
		endStatus: true
	},
	warnOnZeroGradient: true
};

var trainingStore = _.extend(_.clone(globalStore), {
	// With EUBO training, we don't need the target score at all, so we can avoid
	//    computing factors and speed things up.
	noFactors: true
});
console.log('Training...');
utils.runwebppl(Variational, [generateGuided, trainingOpts], trainingStore, '', function(s, diagnostics) {
	console.log('FINISHED training.');
	// Not doing anything with diagnostics for now

	// Save neural nets to disk
	if (!fs.existsSync(saved_params)) {
		fs.mkdirSync(saved_params);
	}
	var paramfile = saved_params + '/' + name + '.txt';
	var nets = _.mapObject(neuralNets, function(net) {
		return net.serializeJSON();
	});
	fs.writeFileSync(paramfile, JSON.stringify(nets));
	console.log('FINISHED writing neural nets/params to disk');
});