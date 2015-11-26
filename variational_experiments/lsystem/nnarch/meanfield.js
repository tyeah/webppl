var nn = require('adnn/nn');
var NNArch = require('./nnarch.js');


// Mean-field: we just learn constant params

var Arch = new NNArch();

Arch.nnFunction('params', function(name, n) {
	return nn.constantparams([n], name);
});

Arch.localFeatures = function(localState) {};
Arch.nLocalFeatures = 0;

Arch.predict = function(globalStore, localState, name, paramBounds) {
	var params = this.params(name, paramBounds.length).eval();
	return this.splitAndBoundParams(params, paramBounds);
};

module.exports = Arch;