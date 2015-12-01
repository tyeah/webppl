var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');

var archname = __filename.split('/').pop().slice(0, -3);

// Mean-field: we just learn constant params
module.exports = NNArch.subclass(archname, {

	params: NNArch.nnFunction(function(name, n) {
		return nn.constantparams([n], name);
	}),

	localFeatures: function(localState) {},
	nLocalFeatures: 0,

	predict: function(globalStore, localState, name, paramBounds) {
		var params = this.params(name, paramBounds.length).eval();
		return this.splitAndBoundParams(params, paramBounds);
	}

});