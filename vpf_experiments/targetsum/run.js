var _ = require('underscore');
var util = require('util');
var fs = require('fs');
var exp = require('../harness');

var resultsDir = __dirname + '/experiment_results';

if (!fs.existsSync(resultsDir)) {
	fs.mkdirSync(resultsDir);
}

var primaryHeader = [
	'converged',
	'flightsRun',
	'timeTaken',
	'averageRelativeError',
	'minStddev',
	'maxStddev',
	'avgStddev'
];
var convergenceHeader = [
	'timeSlice',
	'time',
	'scoreDiff'
];

function makeProcessReturn(primaryFile, convergenceFile) {
	return function(ret) {
		// Generate one row of data for the primary file
		var rows = [];
		var primaryData = { __file__: primaryFile };
		for (var i = 0; i < primaryHeader.length; i++) {
			var name = primaryHeader[i];
			primaryData[name] = ret[name];
		}
		rows.push(primaryData);
		// Generate one row of data for each of the convergence time slices
		for (var i = 0; i < ret.scoreDiffs.length; i++) {
			var time = ret.times[i];
			var scoreDiff = ret.scoreDiffs[i];
			rows.push({ __file__: convergenceFile, timeSlice: i, time: time, scoreDiff: scoreDiff });
		}
		return rows;
	};
}

var configDefaults = {
	file: __dirname + '/targetsum.wppl',
	catchExceptions: true,

	params: {
		// VPF stuff
		nVars: 3,
		numParticles: 100,
		maxNumFlights: 1000,
		verbosity: {},
		// Other stuff
		numTestSamps: 100
	}
};
function config(obj) {
	obj = obj || {};
	return _.extend(_.clone(configDefaults), obj);
}

// For both methods, vary the number of variables
function changeNumVars(nReps) {
	var independentVarNames = ['objective', 'nVars'];
	var name = 'numVars';
	var primaryFile = util.format('%s/%s.csv', resultsDir, name);
	var convergenceFile = util.format('%s/%s_convergence.csv', resultsDir, name);

	var experiment =
		exp.csv(primaryFile, independentVarNames.concat(primaryHeader),
			exp.csv(convergenceFile, independentVarNames.concat(convergenceHeader),
				exp.varying('objective', ['ELBO', 'EUBO'],
					exp.varying('nVars', exp.range(3, 10, 1, nReps),
						exp.run))));

	experiment(config({processReturn: makeProcessReturn(primaryFile, convergenceFile)}));
}

// For both methods, vary the tightness
function changeTightness(nReps) {
	var independentVarNames = ['objective', 'tightness'];
	var name = 'tightness';
	var primaryFile = util.format('%s/%s.csv', resultsDir, name);
	var convergenceFile = util.format('%s/%s_convergence.csv', resultsDir, name);

	var experiment =
		exp.csv(primaryFile, independentVarNames.concat(primaryHeader),
			exp.csv(convergenceFile, independentVarNames.concat(convergenceHeader),
				exp.varying('objective', ['ELBO', 'EUBO'],
					exp.varying('tightness', exp.range(0.1, 1, 0.1, nReps),
						exp.run))));

	experiment(config({processReturn: makeProcessReturn(primaryFile, convergenceFile)}));
}

// For both methods, vary the number of particles (with a strong tightness)
function changeNumParticles(nReps) {
	var independentVarNames = ['objective', 'numParticles'];
	var name = 'numParticles';
	var primaryFile = util.format('%s/%s.csv', resultsDir, name);
	var convergenceFile = util.format('%s/%s_convergence.csv', resultsDir, name);

	var experiment =
		exp.csv(primaryFile, independentVarNames.concat(primaryHeader),
			exp.csv(convergenceFile, independentVarNames.concat(convergenceHeader),
				exp.varying('objective', ['ELBO', 'EUBO'],
					exp.varying('numParticles', exp.range(100, 1000, 100, nReps),
						exp.run))));

	var cfg = config({processReturn: makeProcessReturn(primaryFile, convergenceFile)});
	cfg.params = _.extend(_.clone(cfg.params), {tightness: 0.1});
	experiment(cfg);
}


// changeNumVars(1);
// changeTightness(1);
// changeNumParticles(1);





