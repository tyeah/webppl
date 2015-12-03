var NNArch = require('../../nnarch.js');
var Tensor = require('adnn/tensor');
var ad = require('adnn/ad');
var nn = require('adnn/nn');

var base = require('./base.js');

// How big a latent state representation do we use?
var featureSize = base.prototype.nLocalFeatures;
var latentStateSize = featureSize * 4;


module.exports = NNArch.subclass(base, 'recurrentLocalFeatures', {

	initState: NNArch.nnFunction(function(name) {
		return nn.constantparams([latentStateSize], name);
	}),

	recur: NNArch.nnFunction(function(name) {
		return nn.mlp(featureSize + latentStateSize, [
			{nOut: latentStateSize, activation: nn.tanh},
			{nOut: latentStateSize}
		]);
	}),

	enter: function(globalStore, localState) {
		if (globalStore.latentStateStack === undefined) {
			globalStore.latentStateStack = [ this.initState('initState').eval() ];
		}
		var prev = globalStore.latentStateStack[globalStore.latentStateStack.length-1];
		var f = this.featurize(localState);
		var next = this.recur('recur').eval(ad.tensor.concat(prev, f));
		globalStore.latentStateStack = globalStore.latentStateStack.concat([next]);
	},

	exit: function(globalStore) {
		var n = globalStore.latentStateStack.length;
		globalStore.latentStateStack = globalStore.latentStateStack.slice(0, n-1);
	},

	localFeatures: function(globalStore, localState) {
		// Ensure we have a stack
		if (globalStore.latentStateStack === undefined) {
			this.enter(globalStore, localState);
		}
		// Return the top of the stack
		return globalStore.latentStateStack[globalStore.latentStateStack.length-1];
	},

	nLocalFeatures: latentStateSize
});