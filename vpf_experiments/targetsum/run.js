var _ = require('underscore');
var util = require('util');
var fs = require('fs');
var exp = require('../harness');


if (!fs.existsSync('experiment_results')) {
	fs.mkdirSync('experiment_results');
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
		var primaryData = { __file__ : primaryFile };
		for (var i = 0; i < primaryHeader.length; i++) {
			var name = primaryHeader[i];
			primaryData[name] = ret[name];
		}
		rows.push(primaryData);
		// Generate one row of data for each of the convergence time slices
		for (var i = 0; i < ret.scoreDiffs; i++) {
			var time = ret.times[i];
			var scoreDiff = ret.scoreDiffs[i];
			rows.push({ __file__ : convergenceFile, timeSlice: i, time: time, scoreDiff: scoreDiff });
		}
		return rows;
	};
}

var configDefaults = {
	file: 'targetsum.wppl',

	nVars: 3,
	numParticles: 100,
	maxNumFlights: 2000,
	verbosity: {},

	numTestSamps: 100
};
function config(obj) {
	obj = obj || {};
	return _.extend(_.clone(configDefaults), obj);
}

// For both methods, vary the number of variables
function changeNumVars(nReps) {
	var independentVarNames = ['objective', 'nVars'];
	var name = 'numVars';
	var primaryFile = util.format('experiment_results/%s.csv', name);
	var convergenceFile = util.format('experiment_results/%s_convergence.csv', name);

	var experiment =
		exp.csv(primaryFile, independentVarNames.concat(primaryHeader),
			exp.csv(convergenceFile, independentVarNames.concat(convergenceHeader),
				exp.varying('objective', ['ELBO', 'EUBO'],
					exp.varying('nVars', exp.makeRange(3, 10, 1, nReps),
						exp.run))));
	
	experiment(config({processReturn: makeProcessReturn(primaryFile, convergenceFile)}));
}

// For both methods, vary the tightness

// For both methods, vary the number of particles (with a strong tightness)