var nn = require('adnn/nn');
var NNArch = require('./nnarch.js');


// Parse the target image using one CNN, parse the image-so-far using another
//    CNN, feed those both (plus local features) into a MLP.

var DualCNNArch = new NNArch();

DualCNNArch.nnFunction('cnn', function(name) {
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

DualCNNArch.nnFunction('paramPredictMLP', function(name, nOut) {
	var localStateInput = nn.ast.input();
	var globalStateInput = nn.ast.input();
	var targetInput = nn.ast.input();
	var concatNode = nn.concat.compose(localStateInput, globalStateInput, targetInput);
	var nIn = this.nLocalFeatures + this.nStateFeatures + this.nTargetFeatures;
	var mlpNode = nn.mlp(nIn, [
		{nOut: Math.floor(nIn/2), activation: nn.tanh},
		{nOut: nOut}
	], name).compose(concatNode);
	return nn.ast.compile([localStateInput, globalStateInput, targetInput], [mlpNode]);
});

DualCNNArch.init = function(globalStore) {
	var imgSize = globalStore.target.image.width;
	var imgSizeReduced1 = Math.floor(imgSize/2);
	var imgSizeReduced2 = Math.floor(imgSizeReduced1/2);
	var imgSizeReduced3 = Math.floor(imgSizeReduced2/2);
	this.nTargetFeatures = imgSizeReduced3*imgSizeReduced3*nImgFilters;
	this.nStateFeatures = this.nTargetFeatures;

	globalStore.targetFeatures = this.cnn('targetCNN').eval(globalStore.target.tensor);
	globalStore.stateFeatures = this.cnn('genCNN').eval(globalStore.genImg.toTensor());
};

DualCNNArch.step = function(globalStore, localState) {
	globalStore.stateFeatures = this.cnn('genCNN').eval(globalStore.genImg.toTensor());
};

DualCNNArch.predict = function(globalStore, localState, name, paramBounds) {
	var nOut = paramBounds.length;
	var y = this.paramPredictMLP(name, nOut).eval(
		localState.features, globalStore.stateFeatures, globalStore.targetFeatures);
	return this.splitAndBoundParams(y, paramBounds);
};

module.exports = DualCNNArch;