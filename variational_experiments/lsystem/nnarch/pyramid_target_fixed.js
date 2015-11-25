var nn = require('adnn/nn');
var NNArch = require('./nnarch.js');
var Tensor = require('adnn/tensor');


// Predict ERP params as a function of the local pixel window of the target image
//    around the current position. Do this at multiple scales.

// Variations of this architecture to (possibly) explore:
// * Learnable downsampling operator
//   - Linear? (i.e. conv layer with stride = filter size)
//   - Nonlinear? (i.e. run a 'blocked' MLP over the image)
// * Also throw in a downsampled version of the image-so-far
//   - As extra features in the final MLP?
//   - Linear combine with target features, then throw into MLP?
//   - Learnable linear combination?
//   - Learnable 'co-downsampling' operator that takes both images as input?
// * What 'local features' to use?

var Arch = new NNArch();

var nPyramidLevels = 4;

// This network is not parameterized, so we don't need to register it
//    with nnFunction.
var downsampleNet = nn.meanpool({filterSize: 2});

Arch.init = function(globalStore) {
	// Construct target pyramid
	globalStore.pyramid = [globalStore.target.tensor];
	for (var i = 0; i < nPyramidLevels-1; i++) {
		var prev = globalStore.pyramid[i];
		var next = downsampleNet.eval(prev);
		globalStore.pyramid.push(next);
	}
	this.nTotalFeatures = 9*nPyramidLevels + this.nLocalFeatures;
};

Arch.nnFunction('paramPredictMLP', function(name, nOut) {
	return nn.mlp(this.nTotalFeatures, [
		{nOut: Math.floor(this.nTotalFeatures/2), activation: nn.tanh},
		{nOut: Math.floor(this.nTotalFeatures/4), activation: nn.tanh},
		{nOut: Math.floor(this.nTotalFeatures/8), activation: nn.tanh},
		{nOut: nOut}
	], name);
});

function normalize(x, lo, hi) {
	return (x - lo) / (hi - lo);
}

Arch.predict = function(globalStore, localState, name, paramBounds) {
	// Extract pixel neighborhood at each pyramid level, concat into
	//    one vector (along with local features)
	var features = new Tensor([this.nTotalFeatures]);
	var v = this.constants.viewport;
	var x = normalize(localState.pos.x, v.xmin, v.xmax);
	var y = normalize(localState.pos.y, v.ymin, v.ymax);
	var fidx = 0;
	for (var i = 0; i < nPyramidLevels; i++) {
		var img = globalStore.pyramid[i];
		var imgsize = img.dims[1];	// dim 0 is channel depth (= 1)
		var cx = Math.floor(x*imgsize);
		var cy = Math.floor(y*imgsize);
		for (var wy = cy - 1; wy <= cy + 1; wy++) {
			for (var wx = cx - 1; wx <= cx + 1; wx++) {
				var imgidx = wy*imgsize + wx;
				var inbounds = wx >= 0 && wx < imgsize && wy >= 0 && wy < imgsize;
				// TODO: is zero padding the right thing to do?
				features.data[fidx] = inbounds ? img.data[imgidx] : 0;
				fidx++;
			}
		}
	}
	for (var i = 0; i < this.nLocalFeatures; i++, fidx++) {
		features.data[fidx] = localState.features.data[i];
	}

	// Feed features into MLP
	var nOut = paramBounds.length;
	var y = this.paramPredictMLP(name, nOut).eval(features);
	return this.splitAndBoundParams(y, paramBounds);
};


module.exports = Arch;


