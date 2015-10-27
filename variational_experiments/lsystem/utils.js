var fs = require('fs');
var Canvas = require('canvas');
var assert = require('assert');
var numeric = require('numeric');
var render = require('./render').render;

function renderOut(filename, res, viewport, branches) {
	var canvas = new Canvas(res.width, res.height);
	render(canvas, viewport, branches);
	fs.writeFileSync(filename, canvas.toBuffer());
}


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
	fillWhite: function(w, h) {
		var canv = new Canvas(w, h);
		var ctx = canv.getContext('2d');
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, w, h);
		return this.loadFromCanvas(canv);
	},
	copyToCanvas: function(canvas) {
		canvas.getContext('2d').putImageData(this.imgDataObj, 0, 0);
	},
	getPixel: function(x, y) {
		var i = y*this.width + x;
		return [this.data[4*i], this.data[4*i+1], this.data[4*i+2], this.data[4*i+3]];
	},
	getLuminance: function(x, y) {
		var i = y*this.width + x;
		return 0.2126*this.data[4*i] + 0.7152*this.data[4*i+1] + 0.0722*this.data[4*i+2];
	},
	isFilled: function(x, y) {
		var i = y*this.width + x;
		return this.data[4*i] !== 255 || this.data[4*i+1] !== 255 || this.data[4*i+2] !== 255; 
	},
	percentFilled: function() {
		var filled = 0;
		for (var y = 0; y < this.height; y++) {
			for (var x = 0; x < this.width; x++) {
				filled += this.isFilled(x, y);
			}
		}
		return filled / (this.width * this.height);
	},
	bilateralSymmetryHoriz: function() {
		// Horizonal bilateral symmetry
		var sim = 0;
		for (var y = 0; y < this.height; y++) {
			for (var x = 0; x < this.width / 2; x++) {
				var f1 = this.isFilled(x, y);
				var f2 = this.isFilled(this.width - x - 1, y);
				sim += (f1 === f2);
			}
		}
		return sim / (0.5 * this.width * this.height);
	},
	filledBilateralSymmetryHoriz: function() {
		// Horizonal bilateral symmetry
		var sim = 0;
		var n = 0;
		for (var y = 0; y < this.height; y++) {
			for (var x = 0; x < this.width / 2; x++) {
				var f1 = this.isFilled(x, y);
				var f2 = this.isFilled(this.width - x - 1, y);
				if (f1 || f2) {
					sim += (f1 === f2);
					n++;
				}
			}
		}
		return sim / n;
	},
	numSameBinary: function(other) {
		assert(this.width === other.width && this.height === other.height,
			'numSameBinary: image dimensions do not match!');
		var sim = 0;
		for (var i = 0; i < this.data.length; i += 4) {  // stride of 4 for RGBA pixels
			var eq = (this.data[i] === 255) === (other.data[i] === 255);
			sim += eq;
		}
		return sim;
	},
	percentSameBinary: function(other) {
		var sim = this.numSameBinary(other);
		return sim / (this.height*this.width);
	},
	percentFilledSameBinary: function(other) {
		assert(this.width === other.width && this.height === other.height,
			'percentFilledSameBinary: image dimensions do not match!');
		var sim = 0;
		var n = 0;
		for (var i = 0; i < this.data.length; i += 4) {  // stride of 4 for RGBA pixels
			if (this.data[i] !== 255) {
				sim += (other.data[i] !== 255);
				n++;
			}
		}
		return n > 0 ? sim / n : 0;
	}
};


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


function TargetImageDatabase(directory) {
	this.targetsByIndex = [];
	this.targetsByName = {};
	var filenames = fs.readdirSync(directory);
	for (var i = 0; i < filenames.length; i++) {
		var fullname = directory + '/' + filenames[i];
		var target = {
			filename: fullname,
			image: undefined,
			baseline: undefined,
			canvas: undefined
		};
		this.targetsByIndex.push(target);
		var shortname = filenames[i].slice(0,-4);	// strip the .png
		this.targetsByName[shortname] = target;
	}
}
function ensureTargetLoaded(target) {
	if (target.image === undefined) {
		target.image = new ImageData2D().loadFromFile(target.filename);
		target.baseline = baselineSimilarity(target.image);
		target.canvas = new Canvas(target.image.width, target.image.height);
	}
}
TargetImageDatabase.prototype = {
	numTargets: function() { return this.targetsByIndex.length; },
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


function processRetVals_width(vals) {
	var errs = vals.map(function(v) {
		var width = v.bbox.size().x;
		var targetWidth = v.targetWidth;
		return Math.abs(targetWidth - width) / targetWidth;
	});
	console.log('  avg relative error: ' + numeric.sum(errs)/vals.length);
}


function deleteStoredImages(particle) {
	particle.store.genImg = undefined;
}


module.exports = {
	render: render,
	renderOut: renderOut,
	newImageData2D: function() { return new ImageData2D(); },
	newCanvas: function(w, h) { return new Canvas(w, h); },
	newTargetImageDatabase: function(dir) { return new TargetImageDatabase(dir); },
	normalizedSimilarity: normalizedSimilarity,
	processRetVals_width: processRetVals_width,
	deleteStoredImages: deleteStoredImages
};






