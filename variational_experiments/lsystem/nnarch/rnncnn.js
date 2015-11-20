var nn = require('adnn/nn');
var NNArch = require('./nnarch.js');


// Parse the target image using a CNN, accumulate latent global state using an
//    RNN, feed those both (plus local features) into a MLP.

var Arch = new NNArch();

var nStateFeatures = 10;

Arch.nnFunction('rnnInitState', function(name) {
	return nn.constantparams([nStateFeatures], name);
});

Arch.nnFunction('rnnStep', function(name) {
	var localInput = nn.ast.input();
	var latentInput = nn.ast.input();
	var concatNode = nn.concat.compose(localInput, latentInput);
	var nIn = this.nLocalFeatures + nStateFeatures;
	var mlpNode = nn.mlp(nIn, [
		{nOut: nIn, activation: nn.tanh},
		{nOut: nStateFeatures}
	], name).compose(concatNode);
	return nn.ast.compile([localInput, latentInput], [mlpNode]);
});

Arch.nnFunction('cnn', function(name) {
	var nImgFilters = 1;
	var filterSize = 5;
	return nn.sequence([
		nn.convolution({filterSize: filterSize, outDepth: nImgFilters}, name+'_layer0'),
		nn.maxpool({filterSize: 2}),
		nn.convolution({filterSize: filterSize, outDepth: nImgFilters}, name+'_layer1'),
		nn.maxpool({filterSize: 2}),
		nn.convolution({filterSize: filterSize, outDepth: nImgFilters}, name+'_layer2'),
		nn.maxpool({filterSize: 2})
	], name);
});

Arch.nnFunction('paramPredictMLP', function(name, nOut) {
	var localStateInput = nn.ast.input();
	var globalStateInput = nn.ast.input();
	var targetInput = nn.ast.input();
	var concatNode = nn.concat.compose(localStateInput, globalStateInput, targetInput);
	var nIn = this.nLocalFeatures + nStateFeatures + this.nTargetFeatures;
	var mlpNode = nn.mlp(nIn, [
		{nOut: Math.floor(nIn/2), activation: nn.tanh},
		{nOut: nOut}
	], name).compose(concatNode);
	return nn.ast.compile([localStateInput, globalStateInput, targetInput], [mlpNode]);
});

Arch.init = function(globalStore) {
	var imgSize = globalStore.target.image.width;
	var imgSizeReduced1 = Math.floor(imgSize/2);
	var imgSizeReduced2 = Math.floor(imgSizeReduced1/2);
	var imgSizeReduced3 = Math.floor(imgSizeReduced2/2);
	this.nTargetFeatures = imgSizeReduced3*imgSizeReduced3*nImgFilters;

	this.targetFeatures = this.cnn('targetCNN').eval(globalStore.target.tensor);
	this.stateFeatures = this.rnnInitState().eval();
};

Arch.step = function(globalStore, localState) {
	this.stateFeatures = this.rnnStep().eval(
		localState.features, this.stateFeatures);
};

Arch.predict = function(globalStore, localState, name, paramBounds) {
	var nOut = paramBounds.length;
	var y = this.paramPredictMLP(name, nOut).eval(
		localState.features, this.stateFeatures, this.targetFeatures);
	return this.splitAndBoundParams(y, paramBounds);
};

module.exports = Arch;