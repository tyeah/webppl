var ad = require('adnn/ad');
var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');

var archname = __filename.split('/').pop().slice(0, -3);


// Predict ERP params as a function of the local pixel window of the target image
//    around the current position. Do this at multiple scales.
// Learnable version with multiple linear filters per pyramid level

// Apply same procedure to image so far, feed into MLP. 


var nPyramidLevels = 4;
var filterSize = 3;
var nFilters = 1;


function normalize(x, lo, hi) {
	return (x - lo) / (hi - lo);
}


module.exports = NNArch.subclass(require('./localFeatures'), archname, {

	firstLevelFilters: NNArch.nnFunction(function(name) {
		return nn.convolution({filterSize: filterSize, outDepth: nFilters}, name);
	}),

	downsampleAndFilter: NNArch.nnFunction(function(name) {
		return nn.sequence([
			nn.meanpool({filterSize: 2}, name + '_downsample'),
			nn.convolution({filterSize: filterSize, inDepth: nFilters, outDepth: nFilters}, name + '_filter')
		]);
	}),

	constructTargetPyramid: function(inputImageTensor) {
		var pyramid = [ this.firstLevelFilters('target_level0_filter').eval(inputImageTensor) ];
		for (var i = 0; i < nPyramidLevels-1; i++) {
			var prev = pyramid[i];
			var next = this.downsampleAndFilter('target_level'+(i+1)).eval(prev);
			pyramid.push(next);
		}
		return pyramid;
	},

	constructImageSoFarPyramid: function(globalStore) {
		globalStore.imageSoFarPyramid = [ this.firstLevelFilters('gen_level0_filter').eval(globalStore.genImg.toTensor()) ]; 
		for (var i = 0; i < nPyramidLevels-1; i++) {
			var prev = globalStore.imageSoFarPyramid[i];
			var next = this.downsampleAndFilter('gen_level'+(i+1)).eval(prev);
			globalStore.imageSoFarPyramid.push(next);
		}
	},

	init: function(globalStore) {
		// Construct target pyramid
		if (this.training) {
			globalStore.pyramid = this.constructTargetPyramid(globalStore.target.tensor);
		} else {
			if (globalStore.target.pyramid === undefined) {
				globalStore.target.pyramid = this.constructTargetPyramid(globalStore.target.tensor);
			}
			globalStore.pyramid = globalStore.target.pyramid;
		}
		// Construct image so far pyramid 
		this.constructImageSoFarPyramid(globalStore);
		this.nTotalFeatures = 2*9*nPyramidLevels*nFilters + this.nLocalFeatures;
		this.nTotalFeatures += nPyramidLevels*2; // Extra location features
	},

	step: function(globalStore, localState) {
		// Construct image so far pyramid 
		this.constructImageSoFarPyramid(globalStore);
	},

	paramPredictMLP: NNArch.nnFunction(function(name, nOut) {
		return nn.mlp(this.nTotalFeatures, [
			{nOut: Math.floor(this.nTotalFeatures/2), activation: nn.tanh},
			{nOut: nOut}
		], name);
	}),

	outOfBounds: NNArch.nnFunction(function(name) {
		return nn.constantparams([nPyramidLevels, nFilters], name);
	}),

	predict: function(globalStore, localState, name, paramBounds) {
		// Extract pixel neighborhood at each pyramid level, concat into
		//    one vector (along with local features)
		var outOfBoundsValsTarget = ad.tensorToScalars(this.outOfBounds('target_outOfBounds').eval());
		var outOfBoundsValsSoFar = ad.tensorToScalars(this.outOfBounds('gen_outOfBounds').eval());
		var features = new Array(this.nTotalFeatures);
		var v = this.constants.viewport;
		var x = normalize(localState.pos.x, v.xmin, v.xmax);
		var y = normalize(localState.pos.y, v.ymin, v.ymax);
		var fidx = 0;
		for (var i = 0; i < nPyramidLevels; i++) {
			var img = globalStore.pyramid[i];
			var imgSoFar = globalStore.imageSoFarPyramid[i];
			var imgsize = ad.value(img).dims[1];	// dim 0 is channel depth (i.e. nFilters)
			var cxx = x*imgsize;
			var cyy = y*imgsize;
			var cx = Math.floor(cxx);
			var cy = Math.floor(cyy);
			features[fidx] = (cxx - cx) / imgsize;
			features[fidx+1] = (cyy - cy) / imgsize;
			fidx += 2;
			for (var j = 0; j < nFilters; j++) {
				var outOfBoundsTarget = outOfBoundsValsTarget[i*nFilters + j];
				var outOfBoundsSoFar = outOfBoundsValsSoFar[i*nFilters + j];
				for (var wy = cy - 1; wy <= cy + 1; wy++) {
					for (var wx = cx - 1; wx <= cx + 1; wx++) {
						var imgidx = wx + imgsize*(wy + imgsize*j);
						var inbounds = wx >= 0 && wx < imgsize && wy >= 0 && wy < imgsize;
						features[fidx] = inbounds ? ad.tensorEntry(img, imgidx) : outOfBoundsTarget;
						fidx++;
						
						//Adding image so far to features
						features[fidx] = inbounds ? ad.tensorEntry(imgSoFar, imgidx) : outOfBoundsSoFar;
						fidx++;
					}
				}
			}
		}
		for (var i = 0; i < this.nLocalFeatures; i++, fidx++) {
			features[fidx] = localState.features.data[i];
		}
		features = ad.scalarsToTensor(features);

		// Feed features into MLP
		var nOut = paramBounds.length;
		var y = this.paramPredictMLP(name, nOut).eval(features);
		return this.splitAndBoundParams(y, paramBounds);
	}

});




