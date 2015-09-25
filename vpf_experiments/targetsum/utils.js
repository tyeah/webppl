var _ = require('underscore');
var numeric = require('numeric');

var sum = function(lst) { return _.reduce(lst, function(memo, num){ return memo + num; }, 0); }
var min = function(lst) { return _.reduce(lst, function(memo, num){ return Math.min(memo, num); }, Infinity); }
var max = function(lst) { return _.reduce(lst, function(memo, num){ return Math.max(memo, num); }, -Infinity); }

function computeAdditionalDependentMeasures(result, samps, targetsum) {
	// Average relative error
	var totalerr = 0;
	for (var i = 0; i < samps.length; i++) {
		var nums = samps[i];
		var numsum = sum(nums);
		var relerr = Math.abs(targetsum - numsum) / targetsum;
		totalerr += relerr;
	}
	result.averageRelativeError = totalerr / samps.length;

	// Min/max/mean of std. dev. across variables
	var means = numeric.rep([samps[0].length], 0);
	for (var i = 0; i < samps.length; i++) {
		var nums = samps[i];
		numeric.addeq(means, nums);
	}
	numeric.diveq(means, samps.length);
	var stddevs = numeric.rep([samps[0].length], 0);
	for (var i = 0; i < samps.length; i++) {
		var nums = samps[i];
		var diff = numeric.sub(nums, means);
		numeric.muleq(diff, diff);
		numeric.addeq(stddevs, diff);
	}
	numeric.sqrteq(numeric.diveq(stddevs, samps.length));
	result.minStddev = min(stddevs);
	result.maxStddev = max(stddevs);
	result.avgStddev = sum(stddevs) / stddevs.length;
}


module.exports = {
	computeAdditionalDependentMeasures: computeAdditionalDependentMeasures
};