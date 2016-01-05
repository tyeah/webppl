/*
Takes images in targets/datasets/dir/images.txt and generates lower resolution and flipped 
(reflected across y-axis) versions of all listed images. 
Images.txt which should have one image per line.   

Also generates starting coordinate files for each generated image, flipped and unflipped. 

Command line arguments:
--dir: images read from targets/datasets/dir
--newWidth: final width.
--newHeight: final height.
*/

var fs = require('fs');
var present = require('present');
var assert = require('assert');
var utils = require('../../utils.js');
var Canvas = require('canvas');
var lwip = require('lwip');
var listDirPrefix = '../targets/datasets/';
var sourceDir = '../targets/source/';

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
});

var dir = opts.dir;
var newWidth = opts.newWidth;
var newHeight = opts.newHeight;
assert(dir, 'Must define --dir option');
assert(newWidth, 'Must define --newWidth option');
assert(newHeight, 'Must define --newHeight option');
console.log(opts);

var imagestr = fs.readFileSync(listDirPrefix + dir + '/images.txt', 'utf8');
var images = imagestr.split('\n');

function saveDownsampledAndFlipped(imageName, sourceLoc, outputLoc, outputLocFlipped) {
	lwip.open(sourceLoc, function(err, image) {
	  if (err) throw err;
	  //var newWidth = ratioX*image.width();
	  //var newHeight = ratioY*image.height();
	  //console.log(sourceLoc);
	  image.resize(newWidth, newHeight, function(err, rzdImg) {
	    rzdImg.writeFile(outputLoc, function(err) {
	      if (err) throw err;
	    });  
	  });

	console.log(sourceLoc);
	lwip.open(sourceLoc, function(err, image2) {
	  if (err) throw err;
	  image2.resize(newWidth, newHeight, function(err, rzdImg) {
	      if (err) throw err;
	    	image2.mirror('x', function(err, mirrorImg) {
		  		if (err) throw err;
		  		mirrorImg.writeFile(outputLocFlipped, function(err) {
			 		if (err) throw err;
		  		});
	  		});
	  });
	});
	});
	
	var coordfile = fs.readFileSync(sourceDir + imageName.slice(0, -4) + '.txt', 'utf8');
	var coords = coordfile.split(' ');

	var flippedCoords = [0, 0];
	flippedCoords[1] = coords[1];
	flippedCoords[0] = String(1 - parseFloat(coords[0]));
	
	//Save normalized starting coordinate files to image.txt
	var coordStr = coords[0] + ' ' + coords[1];
	var flippedCoordStr = flippedCoords[0] + ' ' + flippedCoords[1];
	fs.writeFile(listDirPrefix + dir + '/' + imageName.slice(0, -4) + '.txt', coordStr, function(err) {
		if (err) throw err;
	}); 

	//Save normalized starting coordinate files to image_flipped.txt
	fs.writeFile(listDirPrefix + dir + '/' + imageName.slice(0, -4) + '_flipped.txt', flippedCoordStr, function(err) {
		if (err) throw err;
	});

}

//Iterate through each line of images.txt
for (var i = 0; i < images.length; i++) {
	var outputLoc = listDirPrefix + dir + '/' +images[i];
	var outputLocFlipped = listDirPrefix + dir + '/' + images[i].slice(0, -4) + '_flipped.png';
	var sourceLoc = sourceDir + images[i];	
	saveDownsampledAndFlipped(images[i], sourceLoc, outputLoc, outputLocFlipped);
	console.log(outputLoc);
	console.log(sourceLoc);
}
