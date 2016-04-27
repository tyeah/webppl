var fs = require('fs');
var Canvas = require('canvas');
var assert = require('assert');
var Tensor = require('adnn/tensor');
var THREE = require('three');
//var Sobel = require('image_processing/sobel.js');

function getSobel(img) {
	var sobelImg = img.__sobel;
	if (img.__sobel === undefined) {
		img.__sobel = Sobel.sobel(img.toTensorAveraged(0, 1));
		sobelImg = img.__sobel;
	}
	return sobelImg;
}

function checkValidColor(targetImg, imgPos) {
	if (imgPos.x >= 0 && imgPos.x < targetImg.width && 
		imgPos.y >= 0 && imgPos.y < targetImg.height) {
			var currentIndex = targetImg.width*imgPos.y + imgPos.x;
			var currentColor = [targetImg.data[4*currentIndex], 
								targetImg.data[4*currentIndex + 1],
								targetImg.data[4*currentIndex + 2]];	

			if (currentColor[0] != 255 || currentColor[1] != 255 || currentColor[2] != 255) {
				return [true, currentColor];
		}	
	}

	return [false];
}

function getClosestForegroundColor(targetImg, currentImgPos) {
	var radius = 0;
	var closestColor = [255, 0, 0];	
	var foundClosest = false;
	var checkColor = checkValidColor(targetImg, currentImgPos);

	if (checkColor[0] == true) {
		closestColor = checkColor[1];
	}

	while (!foundClosest) {
		radius += 1;
		for (var x_offset = -radius; x_offset <= radius; x_offset+=radius) {
			for (var y_offset = -radius; y_offset <= radius; y_offset+=radius) {
				if (x_offset !== 0 || y_offset !== 0) {
					imgPos = {
						x: currentImgPos.x + x_offset,
						y: currentImgPos.y + y_offset,
					};
					
					var checkColor = checkValidColor(targetImg, imgPos);

					if (checkColor[0] == true) {
						closestColor = checkColor[1];
						foundClosest = true;
						break;
					}
				}
			}
		}	
	}

	return closestColor;

}

// ----------------------------------------------------------------------------
// 2D image class

/*
function ImageData2D() {}
ImageData2D.prototype = {
	constructor: ImageData2D,
	loadFromCanvas: function(canvas) {
		this.imgDataObj = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
		this.data = this.imgDataObj.data;
		this.width = canvas.width;
		this.height = canvas.height;
		return this;
	},
	copyToCanvas: function(canvas) {
		var ctx = canvas.getContext('2d');
		var imgDataObj = this.imgDataObj;
		if (imgDataObj === undefined) {
			imgDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
			var n = this.data.length;
			for (var i = 0; i < n; i++) {
				imgDataObj.data[i] = this.data[i];
			}
		}
		ctx.putImageData(imgDataObj, 0, 0);
	},
	loadFromFramebuffer: function(gl) {
		this.width = gl.drawingBufferWidth;
		this.height = gl.drawingBufferHeight;
		this.data = new Uint8Array(this.width*this.height*4);
		gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
		return this;
	},
	copyToFramebuffer: function(gl) {
		var render = require('./render.js');
		render.drawPixels(gl, this.data);
	},
	loadFromFile: function(filename) {
		// Sort of a hack: load it to an Image, then draw to a Canvas, then do
		//    loadFromCanvas.
		var filedata = fs.readFileSync(filename);
		var img = new Canvas.Image;
		img.src = filedata;
		var canvas = new Canvas(img.width, img.height);
		var ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0, img.width, img.height);
		this.loadFromCanvas(canvas);
		return this;
	},
	saveToFile: function(filename) {
		// Again, hack: copy to canvas, then save that to a file.
		var canv = new Canvas(this.width, this.height);
		this.copyToCanvas(canv);
		fs.writeFileSync(filename, canv.toBuffer());
	},
	fillWhite: function(w, h) {
		var canv = new Canvas(w, h);
		var ctx = canv.getContext('2d');
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, w, h);
		return this.loadFromCanvas(canv);
	},
	numSameBinary: function(other) {
		// assert(this.width === other.width && this.height === other.height,
		// 	'numSameBinary: image dimensions do not match!');
 		if (this.width !== other.width || this.height !== other.height) {
 			assert(false, 'numSameBinary: image dimensions do not match (' +
 				this.width + 'x' + this.height + ' vs. ' + other.width + 'x' + other.height + ')');
 		}
		var sim = 0;
		var n = this.data.length | 0;
		for (var i = 0; i < n; i += 4) {  // stride of 4 for RGBA pixels
			var eq = (this.data[i] === 255) === (other.data[i] === 255);
			sim += eq;
		}
		return sim;
	},
	weightedPercentSameBinary: function (other, sobelImg, flatWeight) {
		assert(this.width === other.width && this.height === other.height
			&& this.width === sobelImg.dims[1] && this.height === sobelImg.dims[2],
			'weightedPercentSameBinary: image dimensions do not match!');
		var sim = 0;
		var n = this.data.length | 0;
		var sumWeights = 0;
		for (var i = 0; i < n; i += 4) {  // stride of 4 for RGBA pixels
			var thisEmpty = this.data[i] === 255;
			var otherEmpty = other.data[i] === 255;
			var eq = thisEmpty === otherEmpty;
			var w = otherEmpty ? 1 : flatWeight + (1-flatWeight)*sobelImg.data[i/4];
			sim += w*eq;
			sumWeights += w;
		}

		sim = sim/sumWeights;
		return sim;
	},
	//flatWeight: floor for zero gradient pixels
	weightedColorSimilarity: function (other, sobelImg, flatWeight) {
		assert(this.width === other.width && this.height === other.height
			&& this.width === sobelImg.dims[1] && this.height === sobelImg.dims[2],
			'weightedColorSimilarity: image dimensions do not match!');
		
		//Compute gradient weighted color distance
		var n = this.data.length | 0;
		var dist = 0;
		var nEntries = 0;
		for (var i = 0; i < n; i+=4) {
			var thisEmpty = (this.data[i] === 255 && this.data[i+1] === 255 && this.data[i+2] === 255);
			var otherEmpty = (other.data[i] === 255 && other.data[i+1] === 255 && other.data[i+2] === 255);				
			var w = otherEmpty ? 1 : flatWeight + (1-flatWeight)*sobelImg.data[Math.floor(i/4)];
			
			for (var j = 0; j < 3; j++) {
				dist += Math.abs((this.data[i+j]/255.0) - (other.data[i+j]/255.0));
				nEntries += 1;
			}
		}	

		dist = dist/nEntries;

		var sim = 1 - dist;

		return sim;
	},
	percentSameBinary: function(other) {
		var sim = this.numSameBinary(other);
		return sim / (this.height*this.width);
	},
	numFilled: function() {
		var count = 0;
		var n = this.data.length | 0;
		for (var i = 0; i < n; i += 4) {
			count += (this.data[i] !== 255);
		}
		return count;
	},
	percentFilled: function() {
		var n = this.numFilled();
		return n / (this.height*this.width);
	},
	binaryBilateralSymmetryScore: function() {
		var dist = 0;
		var w = this.width | 0;
		var h = this.height | 0;
		var whalf = Math.floor(w / 2) | 0;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < whalf; x++) {
				var xmirr = w - 1 - x;
				var i = y*w + x;
				var imirr = y*w + xmirr;
				// Stride of 4 for RGBA
				// var d = Math.abs(this.data[4*i] - this.data[4*imirr]) / 255;
				var d = (this.data[4*i] === 255) !== (this.data[4*imirr] === 255);
				dist += d;
			}
		}
		return 1 - dist/(whalf*h);
	},
	binaryFilledBilateralSymmetryScore: function() {
		var dist = 0;
		var n = 0;
		var w = this.width;
		var h = this.height;
		var whalf = Math.floor(w / 2);
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < whalf; x++) {
				var xmirr = w - 1 - x;
				var i = y*w + x;
				var imirr = y*w + xmirr;
				// Stride of 4 for RGBA
				var v = this.data[4*i];
				var vmirr = this.data[4*imirr];
				if (v !== 255) {
					n++;
					dist += vmirr === 255;
				}
				if (vmirr !== 255) {
					n++;
					dist += v === 255;
				}
			}
		}
		return 1 - dist/n;
	},
	toBinaryByteArray: function() {
		var numPixels = this.width*this.height;
		var numBytes = Math.ceil(numPixels/8);
		var arr = [];
		for (var i = 0; i < numBytes; i++) {
			arr.push(0);
		}
		for (var i = 0; i < numPixels; i++) {
			var r = this.data[4*i];
			var g = this.data[4*i+1];
			var b = this.data[4*i+2];
			var bit = (r < 128 && g < 128 && b < 128);
			var byteIndex = Math.floor(i / 8);
			var byteRem = i % 8;
			arr[byteIndex] |= (bit << byteRem);
		}
		return new Uint8Array(arr);
	},
	fromBinaryByteArray: function(arr, w, h) {
		this.fillWhite(w, h);
		var numPixels = w*h;
		for (var i = 0; i < numPixels; i++) {
			var byteIndex = Math.floor(i / 8);
			var byteRem = i % 8;
			var bit = (arr[byteIndex] >> byteRem) & 1;
			var pixel = bit === 1 ? 0 : 255;
			this.data[4*i] = pixel;
			this.data[4*i+1] = pixel;
			this.data[4*i+2] = pixel;
			this.data[4*i+3] = 255;	// full alpha
		}
		return this;
	},
	// Converts [0, 255] to [lo, hi]
	toTensor: function(lo, hi) {
		if (lo === undefined) lo = -1;
		if (hi === undefined) hi = 1;
		var x = new Tensor([1, this.height, this.width]);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var r = this.data[4*i];
			var t = r / 255;
			x.data[i] = (1-t)*lo + t*hi;
		}
		return x;
	},
	toTensorAveraged: function(lo, hi) {
		if (lo === undefined) lo = -1;
		if (hi === undefined) hi = 1;
		var x = new Tensor([1, this.height, this.width]);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var avg = (this.data[4*i] + this.data[4*i + 1] + this.data[4*i + 2])/3;
			//console.log(avg);
			var t = avg / 255;
			x.data[i] = (1-t)*lo + t*hi;
		}
	return x;
	},
	// Converts [lo, hi] to [0, 255]
	fromTensor: function(x, lo, hi) {
		if (lo === undefined) lo = -1;
		if (hi === undefined) hi = 1;
		var range = hi - lo;
		var h = x.dims[1];
		var w = x.dims[2];
		this.fillWhite(w, h);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var t = (x.data[i] - lo) / range;
			var p = 255 * t;
			this.data[4*i] = p;
			this.data[4*i+1] = p;
			this.data[4*i+2] = p;
			this.data[4*i+3] = 255;	// full alpha
		}
		return this;
	},
	//// TEST /////
	gradNorm: function() {
		var gradImg = Sobel.sobel(this.toTensor(0, 1));
		var s = 0;
		var n = this.width*this.height;
		for (var i = 0; i < n; i++) {
			s += gradImg.data[i];
		}
		return s / n;
	}
};


// ----------------------------------------------------------------------------
// Similarity functions


// Similarity function between target image and another image
function binarySimilarity(img, targetImg) {
	return img.percentSameBinary(targetImg);
}

function makeGradientWeightedColorSimilarity(edgeMul) {
	var flatWeight = 1 / edgeMul;
	return function(img, targetImg) {
		var sobelTarget = getSobel(targetImg);
		
		//var sobelImg = new ImageData2D().fromTensor(sobelTarget);
		//sobelImg.saveToFile('sobel/sobelImg_' + (Math.round(Math.random()*100)).toString() + '.png');

		var val = img.weightedColorSimilarity(targetImg, sobelTarget, flatWeight);
		return val;
	};	
}

// Gradient (of target) weighted binary similarity
function makeGradientWeightedSimilarity(edgeMul) {
	var flatWeight = 1 / edgeMul;
	return function(img, targetImg) {
		var sobelTarget = getSobel(targetImg);

		//var sobelImg = new ImageData2D().fromTensor(sobelTarget);
		//sobelImg.saveToFile('sobel/sobelImg_' + (Math.round(Math.random()*100)).toString() + '.png');

		return img.weightedPercentSameBinary(targetImg, sobelTarget, flatWeight);
	};
}

// Sobel similarity
function sobelSimilarity(img, targetImg) {
	var sobelTarget = getSobel(targetImg);
	var sobelImg = Sobel.sobel(img.toTensor());
	var numEntries = sobelImg.dims[1]*sobelImg.dims[2];

	var d = 0;
	for (var i = 0; i < numEntries; i++) {
		d += Math.abs(sobelImg.data[i] - sobelTarget.data[i]);
	}
	d /= numEntries;

	// Convert distance to similarity
	var sim = 1 - d;
	return sim;
}

// Linear combination of two similarity measures
function makeCombinedSimilarity(weight, sim1, sim2) {
	if (weight == 0) {
		return sim1;
	} else if (weight === 1) {
		return sim2;
	} else {
		return function(img, targetImg) {
			var s1 = sim1(img, targetImg);
			var s2 = sim2(img, targetImg);
			return (1 - weight)*s1 + weight*s2;
		};
	}
}

///////////////////////////
// Which similarity measure should we use?
// var similarity = binarySimilarity;
var similarity = makeGradientWeightedSimilarity(1.5);
//var similarity = makeGradientWeightedColorSimilarity(5.0); //1.5
// var similarity = sobelSimilarity;
// var similarity = binarizedSobelSimilarity;
// var similarity = makeCombinedSimilarity(0.5, binarySimilarity, sobelSimilarity);
///////////////////////////


// Baseline similarity of a blank image to a target image
function baselineSimilarity(targetImg) {
	var w = targetImg.width;
	var h = targetImg.height;
	var img = new ImageData2D().fillWhite(w, h);
	return similarity(img, targetImg);
}

// Similarity normalized against the baseline
// 'target' is a target object from the TargetImageDatabase
function normalizedSimilarity(img, target) {
	var sim = similarity(img, target.image);
	return (sim - target.baseline) / (1 - target.baseline);
}
*/


// ----------------------------------------------------------------------------
// Database of target images


function TargetImageDatabase(directory) {
	this.directory = directory;
	this.targetsByIndex = [];
	this.targetsByName = {};
	var filenames = fs.readdirSync(directory);
	for (var i = 0; i < filenames.length; i++) {
		//Image files only
		var ext = filenames[i].slice(-4);
		if (ext == '.png' || ext == '.jpg') {
			var fullname = directory + '/' + filenames[i];
			var shortname = filenames[i].slice(0,-4);	// strip the .png

			var target = {
				index: this.targetsByIndex.length,				
				shortname: shortname,
				filename: fullname,
				image: undefined,
				tensor: undefined,
			};
			this.targetsByIndex.push(target);
			this.targetsByName[shortname] = target;
		}
	}
}

function ensureTargetLoaded(target) {
	if (target.image === undefined) {
		target.image = new ImageData2D().loadFromFile(target.filename);
		target.tensor = target.image.toTensor();
	}
}
TargetImageDatabase.prototype = {
	numTargets: function() { return this.targetsByIndex.length; },
	targetSize: function() {
		var t = this.getTargetByIndex(0);
		return {
			width: t.image.width,
			height: t.image.height
		};
	},
	getTargetByIndex: function(i) {
		assert(i >= 0 && i < this.targetsByIndex.length);
		var target = this.targetsByIndex[i];
		ensureTargetLoaded(target);
		return target;
	},
	getTargetByName: function(name) {
		var target = this.targetsByName[name];
		assert(target !== undefined);
		ensureTargetLoaded(target);
		return target;
	}
};


// ----------------------------------------------------------------------------
// Render utilities actually exposed to the program during inference
/*
var render = require('./render.js');

var rendering = {
	canvas: undefined,
	init: function(rootdir, w, h) {
		render.setRootDir(rootdir);
		this.canvas = new Canvas(w, h);
	},
	renderStart: function(geo, viewport) {
		render.renderCanvasProxy(this.canvas, viewport, geo);
	},
	renderIncr: function(geo, viewport) {
		render.renderCanvasProxy(this.canvas, viewport, geo, true, false);
	},
	drawImgToRenderContext: function(img) {
		img.copyToCanvas(this.canvas);
	},
	copyImgFromRenderContext: function() {
		return new ImageData2D().loadFromCanvas(this.canvas);
	}
};


// ----------------------------------------------------------------------------
// Bounds for various geometries

var bboxes = {
	branch: function(branch) {
		var bbox = new THREE.Box2();
		bbox.expandByPoint(branch.start);
		bbox.expandByPoint(branch.end);
		return bbox;
	},
	leaf: (function() {
		function pivot(p, sin, cos, c) {
			return new THREE.Vector2(
				cos*p.x + sin*p.y + c.x,
				sin*p.x - cos*p.y + c.y
			);
		}
		// Conservative:
		// Compute corners of object-space ellipse,
		//    transform them into world-space, then
		//    compute the BBox of those points.
		return function(leaf) {
			var w2 = leaf.width/2;
			var l2 = leaf.length/2;
			var p0 = new THREE.Vector2(-w2, -l2);
			var p1 = new THREE.Vector2(w2, -l2);
			var p2 = new THREE.Vector2(-w2, l2);
			var p3 = new THREE.Vector2(w2, l2);
			var sin = Math.sin(leaf.angle);
			var cos = Math.cos(leaf.angle);
			var center = leaf.center;
			p0 = pivot(p0, sin, cos, center);
			p1 = pivot(p0, sin, cos, center);
			p2 = pivot(p0, sin, cos, center);
			p3 = pivot(p0, sin, cos, center);
			var box = new THREE.Box2();
			box.expandByPoint(p0);
			box.expandByPoint(p1);
			box.expandByPoint(p2);
			box.expandByPoint(p3);
			return box;
		}
	})(),
	flower: function(flower) {
		var min = new THREE.Vector2(
			flower.center.x - flower.radius,
			flower.center.y - flower.radius
		);
		var max = new THREE.Vector2(
			flower.center.x + flower.radius,
			flower.center.y + flower.radius
		);
		return new THREE.Box2(min, max);
	}
};


// ----------------------------------------------------------------------------
// Misc

function deleteStoredImages(particle) {
	particle.store.genImg = undefined;
}
*/


// ----------------------------------------------------------------------------



module.exports = {
	//ImageData2D: ImageData2D,
	TargetImageDatabase: TargetImageDatabase,
	//normalizedSimilarity: normalizedSimilarity,
	//rendering: rendering,
	//bboxes: bboxes,
	//deleteStoredImages: deleteStoredImages,
	//getClosestForegroundColor: getClosestForegroundColor
};






