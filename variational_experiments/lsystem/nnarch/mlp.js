var nn = require('adnn/nn');
var NNArch = require('./nnarch.js');


// Really simple architecture where we predict ERP params using a multi-layer
//    perceptron of just the local features

var Arch = new NNArch();

Arch.nnFunction('paramPredictMLP', function(name, nOut) {
	return nn.mlp(this.nLocalFeatures, [
		{nOut: 10, activation: nn.tanh},
		{nOut: nOut}
	], name);
});

Arch.predict = function(globalStore, localState, name, paramBounds) {
	var nOut = paramBounds.length;
	var x = localState.features;
	var y = this.paramPredictMLP(name, nOut).eval(x);
	return this.splitAndBoundParams(y, paramBounds);
};

module.exports = Arch;