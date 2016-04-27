var utils = require('../../utils.js');
var nnarch = require('../nnarch');
var ad = require('adnn/ad');
var Tensor = require('adnn/tensor');
var fs = require('fs');
var _ = require('underscore');
var assert = require('assert');

var argv = require('minimist')(process.argv.slice(2), {
  default: {
             program: 'exp_gmm'
           }
});

var rootdir = __dirname + '/..'; // here __dirname is where this js file locates
var file = rootdir + '/ye_programs/' + argv.program + '.wppl';
var tracefile = rootdir + '/ye_data/exp_trace.txt';
var traces = utils.loadTraces(tracefile);
//console.log(traces);
var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
//console.log(rets);

var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js
//globalStore.hidden = 0.5; // makes no difference to ret. cannot pass value back
//rets.globalStore = 0.5; // makes no difference to ret
var g = rets.generateGuided;

/***************************************************
 * define neural net
 * need to register parameters
 */
/*
var arch = 'mlp'
var ArchType = nnarch.getArchByName(arch);
var nnGuide = new ArchType();
nnGuide.setTraining(true);
globalStore.nnGuide = nnGuide;
*/

/*
var nn = require('adnn/nn');
var Tensor = require('adnn/tensor');

var outDim = 2;
var layers = [
  nn.linear(1, 5),
  nn.sigmoid,
  nn.linear(5, 5),
  nn.sigmoid,
  nn.linear(5, outDim)
];
var net = nn.sequence(layers);
net.setTraining(true);
globalStore.nnGuide = net;
*/
/***************************************************/
/*
var gparams = ad.tensorToScalars(new Tensor([2]).fromArray([0, 1]));
ad.lift(gparams[0]);
ad.lift(gparams[1]);
globalStore.vparams = {gaussian0: gparams};
*/
globalStore.vparams = {gaussian0: ad.lift(new Tensor([2]).fromArray([0, 0.3]))};
//globalStore.vparams = {gaussian0: [ad.lift(0), ad.lift(1)]};
//globalStore.vparams = {gaussian0: [ad.lift(new Tensor([1]).fromArray([0])), ad.lift(new Tensor([1]).fromArray([0]))]};

var trainingOpts = {
	numParticles: 1,					// mini batch size
	maxNumFlights: 5000,				// max number of mini-batches
	convergeEps: 0.1, //evaluated by some norm of gradient of params
	exampleTraces: traces,
  optimizer: {
    name: 'adagrad',
	  initLearnRate: 0.5
  },
	gradientEstimator: 'EUBO',
	verbosity: {
		flightNum: true,
		time: true,
		scoreDiff: true,
		endStatus: true,
	},
	warnOnZeroGradient: true
  /*
	numParticles: 1,				// mini batch size
	maxNumFlights: 20,	// max number of mini-batches
	convergeEps: 0.001,
	gradientEstimator: 'EUBO',
	exampleTraces: traces,
	optimizer: {
		name: 'adam',
		initLearnRate: 0.01,
		blendWeight1: 0.75,
		blendWeight2: 0.75
	},
	verbosity: {
		flightNum: true,
		time: true,
		guideScoreAvg: 100,
		endStatus: true,
	},
	warnOnZeroGradient: true
  */
};

utils.runwebppl(Variational, [g, trainingOpts], globalStore, '', function(s, ret) {
  /*
  console.log(s);//s is globalStore
  console.log(Object.keys(ret));//ret is the ERP got by Enumerate(g)
  console.log(ret.support());
  console.log(Math.exp(ret.score([], true)));
  console.log(Math.exp(ret.score([], false)));
  */
  console.log(globalStore.vparams);
});
