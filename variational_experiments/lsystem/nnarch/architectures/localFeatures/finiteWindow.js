var NNArch = require('../../nnarch.js');
var Tensor = require('adnn/tensor');
var ad = require('adnn/ad');


// How big is the finite window?
nFrames = 1;


module.exports = NNArch.subclass(require('./base.js'), 'finiteWindowLocalFeatures', {

	enter: function(globalStore, localState) {
		var f = this.featurize(localState);
		globalStore.featureStack = (globalStore.featureStack || []).concat([f]);
	},

	exit: function(globalStore) {
		var n = globalStore.featureStack.length;
		globalStore.featureStack = globalStore.featureStack.slice(0, n-1);
	},

	localFeatures: function(globalStore, localState) {
		// Make sure we have a feature stack
		if (globalStore.featureStack === undefined) {
			this.enter(globalStore, localState);
		}
		// Simple special case if nFrames === 1
		if (nFrames === 1) {
			return globalStore.featureStack[globalStore.featureStack.length-1];
		}
		// Concat together the top 4 things on the stack
		// If there are less than 4, then repeat the bottom-most
		var nTotal = globalStore.featureStack.length;
		var starti = Math.max(0, nTotal - nFrames);
		var nShort = nFrames - (nTotal - starti);
		var arr = [];
		for (var i = 0; i < nShort; i++) {
			arr.push(globalStore.featureStack[starti]);
		}
		for (var i = starti; i < nTotal; i++) {
			arr.push(globalStore.featureStack[i]);
		}
		return ad.tensor.concat(arr);
	},

	nLocalFeatures: 4 * nFrames
});