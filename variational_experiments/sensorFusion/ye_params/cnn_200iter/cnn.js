var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');
var ad = require('adnn/ad');

var archname = __filename.split('/').pop().slice(0, -3);

// Really simple architecture where we predict ERP params using a multi-layer
//    perceptron of just the local features
module.exports = NNArch.subclass(NNArch, archname, {

	activation: nn.relu,

	cnn: NNArch.nnFunction(function(name, nOut) {
		return nn.sequence([
			nn.convolution({inDepth: 1, outDepth: 16, filterSize: 3}),
			this.activation,
			nn.linear(28 * 28 * 16, nOut),
			nn.softmax])}),

	predict: function(globalStore, name) { // X should be input tensor
		var nOut = 10;//paramBounds.length;
		var X = globalStore.target.tensor;
		//console.log(globalStore.target.tensor.data);
		//var x = localState.features;
		//var y = this.paramPredictMLP(name, nOut).eval(x);
		var y = this.cnn(name, nOut).eval(X);
		//return this.splitAndBoundParams(y, paramBounds);
		return ad.tensorToScalars(y);
	}

});
//
//activation = nn.relu
//var nnGuide = nn.sequence([nn.convolution({inDepth: 1, outDepth: 16, filterSize: 3}),activation,nn.convolution({inDepth: 16, outDepth: 16, filterSize: 3}),activation,nn.linear(28 * 28 * 16, nOut),nn.softmax])