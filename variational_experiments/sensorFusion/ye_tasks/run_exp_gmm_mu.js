var utils = require('../../utils.js');
var nnarch = require('../nnarch');
var ad = require('adnn/ad');
var Tensor = require('adnn/tensor');
var fs = require('fs');
var _ = require('underscore');
var assert = require('assert');

var argv = require('minimist')(process.argv.slice(2), {
  default: {
             program: 'exp_gmm_mu'
           }
});

var rootdir = __dirname + '/..'; // here __dirname is where this js file locates
var file = rootdir + '/ye_programs/' + argv.program + '.wppl';
var tracefile = rootdir + '/ye_data/exp_trace.txt';
var traces = utils.loadTraces(tracefile);
console.log(traces);
var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
//console.log(rets);

var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js
var g = rets.generateGuided;

globalStore.vparams = {gaussian0: ad.lift(new Tensor([1]).fromArray([0]))};

var trainingOpts = {
	numParticles: 1,					// mini batch size
	maxNumFlights: 5,				// max number of mini-batches
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
};

//console.log(Variational.apply(null, [globalStore, '', function(s, ret) {console.log(1)}, 
//      g, trainingOpts]));
//console.log(Variational);
utils.runwebppl(Variational, [g, trainingOpts], globalStore, '', function(s, ret) {
  /*
  console.log(s);//s is globalStore
  console.log(Object.keys(ret));//ret is the ERP got by Enumerate(g)
  console.log(ret.support());
  console.log(Math.exp(ret.score([], true)));
  console.log(Math.exp(ret.score([], false)));
  */
  console.log(globalStore.vparams.gaussian0);
});
