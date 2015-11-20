var assert = require('assert');
var Tensor = require('adnn/tensor');
var ad = require('adnn/ad');


var fuzz = [0, 1e-8];
function normalize(x, lo, hi) {
	// Fuzz prevents values from normalizing to exactly zero (causing zero
	//    derivatives)
	return (2 * (x - lo) / (hi - lo)) - 1 + gaussianERP.sample(fuzz);
};

var TWOPI = 2*Math.PI;
function normang(theta) {
	if (theta >= 0) {
		return theta - (TWOPI*Math.floor(theta / TWOPI));
	} else {
		return theta - (TWOPI*Math.ceil(theta / TWOPI)) + TWOPI;
	}
};


// Base class for all neural net architectures

function NNArch() {
	this.constants = {};
	this.nnCache = {};
};


// Public interface -----------------------------------------------------------


// The client program can register constants, which may be useful for e.g.
//    computing local features
NNArch.prototype.constant = function(name, val) {
	this.constants[name] = val;
};

// Computation done once at the beginning of program execution
// By default, do nothing
NNArch.prototype.init = function(globalStore) {};

// Computation done after new geometry has been added
// By default, do nothing
NNArch.prototype.step = function(globalStore, localState) {};

// Compute local features from a local state object
// By default, ues normalized position, width, and angle
NNArch.prototype.localFeatures = function(localState) {
	var viewport = this.constants.viewport;
	var minWidth = this.constants.minWidth;
	var initialWidth = this.constants.initialWidth;
	return new Tensor([4]).fromFlatArray([
		normalize(localState.pos.x, viewport.xmin, viewport.xmax),
		normalize(localState.pos.y, viewport.ymin, viewport.ymax),
		normalize(localState.width, minWidth, initialWidth),
		normalize(normang(localState.angle), 0, 2*Math.PI)
	]);
};
// The number of local features (subclasses will need to know this when
//    building neural nets)
NNArch.prototype.nLocalFeatures = 4;

// Computation done to predict ERP params
NNArch.prototype.predict = function(globalStore, localState, name, paramBounds) {
	assert(false, 'predict must be implemented!');
};


// Private interface (for subclasses only) ------------------------------------


// Split a parameter tensor into scalars, then apply bounding transforms
// Helper function for all concrete implementations of 'predict'
NNArch.prototype.splitAndBoundParams = function(params, bounds) {
	var sparams = ad.tensorToScalars(params);
	for (var i = 0; i < sparams.length; i++) {
		var sp = sparams[i];
		sparams[i] = (bounds[i] ? bounds[i](sp) : sp);
	}
	return sparams;
};

// Register a new function that creates neural nets.
// The first argument to the function must be a name for the net.
//    (if undefined, the name is assumed to be the function name)
// The function is memoized on this first argument.
NNArch.prototype.nnFunction = function(fnname, fn) {
	this[fnname] = function() {
		var name = arguments[0] || fnname;
		var net = this.nnCache[name];
		if (net === undefined) {
			net = fn.apply(this, arguments);
			this.nnCache[name] = net;
			Variational.registerParams(name, net.parameters);
			net.setTraining(true);
		}
		return net;
	}.bind(this);
};

// Get a reference to the cache of created neural nets
NNArch.prototype.getNeuralNetCache = function() {
	return this.nnCache;
};



module.exports = NNArch;




