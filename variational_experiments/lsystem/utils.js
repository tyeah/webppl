var fs = require('fs');
var Canvas = require('canvas');
var assert = require('assert');
var Tensor = require('adnn/tensor');
var THREE = require('three');


// ----------------------------------------------------------------------------
// 2D image class


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
		assert(this.width === other.width && this.height === other.height,
			'numSameBinary: image dimensions do not match!');
		var sim = 0;
		var n = this.data.length | 0;
		for (var i = 0; i < n; i += 4) {  // stride of 4 for RGBA pixels
			var eq = (this.data[i] === 255) === (other.data[i] === 255);
			sim += eq;
		}
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
	// Converts [0, 255] to [-1, 1]
	toTensor: function() {
		var x = new Tensor([1, this.height, this.width]);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var r = this.data[4*i];
			x.data[i] = 2*(r / 255) - 1;
		}
		return x;
	},
	// Converts [-1, 1] to [0, 255]
	fromTensor: function(x) {
		var h = x.dims[1];
		var w = x.dims[2];
		this.fillWhite(w, h);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var p = Math.floor(255*0.5*(x.data[i] + 1));
			this.data[4*i] = p;
			this.data[4*i+1] = p;
			this.data[4*i+2] = p;
			this.data[4*i+3] = 255;	// full alpha
		}
		return this;
	}
};


// ----------------------------------------------------------------------------
// Similarity functions


// Similarity function between target image and another image
function similarity(img, targetImg) {
	return img.percentSameBinary(targetImg);
}

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

			//Read .txt file with coordinates
			var coordfile = fs.readFileSync(directory + '/' + shortname + '.txt', 'utf8');
			var coords = coordfile.split(' ');

			var startPos = new THREE.Vector2(parseFloat(coords[0]), parseFloat(coords[1]));

			var target = {
				index: i,
				shortname: shortname,
				filename: fullname,
				image: undefined,
				baseline: undefined,
				canvas: undefined,
				tensor: undefined,
				startPos: startPos
			};
			this.targetsByIndex.push(target);
			this.targetsByName[shortname] = target;
		}
	}
}

function ensureTargetLoaded(target) {
	if (target.image === undefined) {
		target.image = new ImageData2D().loadFromFile(target.filename);
		target.baseline = baselineSimilarity(target.image);
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
	})()
};


// ----------------------------------------------------------------------------
// Misc

function deleteStoredImages(particle) {
	particle.store.genImg = undefined;
}


// ----------------------------------------------------------------------------


module.exports = {
	ImageData2D: ImageData2D,
	TargetImageDatabase: TargetImageDatabase,
	normalizedSimilarity: normalizedSimilarity,
	rendering: rendering,
	bboxes: bboxes,
	deleteStoredImages: deleteStoredImages
};






