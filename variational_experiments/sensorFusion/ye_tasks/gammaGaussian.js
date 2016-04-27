// Run using: webppl gammaGaussian.wppl

var ad = require.call(null, 'adnn/ad');
var utils = require('../../utils.js');

// Example from https://en.wikipedia.org/wiki/Variational_Bayesian_methods

var a0 = 1;
var b0 = 1;
var mu0 = 1;
var lambda0 = 1;

// Needs to be outside of 'program,' so that it persists across runs
var params = ad.params([4]);

var program = function() {
	Variational.registerParams('myParams', [params]);
	var p = ad.tensorToScalars(params);

	// The 'exp' transform guarantees the param will be nonnegative
	Variational.gammaERP.importanceERP.setParams([ad.scalar.exp(p[0]), ad.scalar.exp(p[1])]);
	var tau = sample(Variational.gammaERP, [a0, 1 / b0]);

	Variational.gaussianERP.importanceERP.setParams([p[2], ad.scalar.exp(p[3])]);
	var mu = sample(Variational.gaussianERP, [mu0, 1 / Math.sqrt(lambda0 * tau)]);

	factor(gaussianERP.score([mu, 1 / Math.sqrt(tau)], 1));
	factor(gaussianERP.score([mu, 1 / Math.sqrt(tau)], 2));

	return mu;
};


Variational(program, {
	numParticles: 100,					// mini batch size
	maxNumFlights: 5000,				// max number of mini-batches
	convergeEps: 0.1,
  optimizer: {
    name: 'adagrad',
	  initLearnRate: 0.5
  },
	gradientEstimator: 'ELBO',
	verbosity: {
		flightNum: true,
		time: true,
		scoreDiff: true,
		endStatus: true,
		// params: true,
		// gradientEstimate: true
	},
	warnOnZeroGradient: true
});

var p = ad.tensorToScalars(params).map(ad.value);
console.log(Math.exp(p[0]), Math.exp(p[1]), p[2], Math.exp(p[3]));
true;	// Dummy return value
