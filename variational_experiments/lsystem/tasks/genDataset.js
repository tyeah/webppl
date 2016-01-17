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
var assert = require('assert');
var Canvas = require('canvas');
var util = require('util');
var syscall = require('child_process').execSync;

var listDirPrefix = __dirname + '/../targets/datasets/';
var sourceDir = __dirname + '/../targets/source/';

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
// Trim last newline, if needed
if (images[images.length-1] === '') images.pop();

function saveDownsampledAndFlipped(imageName, sourceLoc, outputLoc, outputLocFlipped) {
	// Save resized + flipped images
	var resizeCall = util.format('convert %s -filter point -resize %dx%d\! %s', sourceLoc, newWidth, newHeight, outputLoc);
	// console.log('*** ' + resizeCall);
	syscall(resizeCall);
	var flopCall = util.format('convert %s -flop %s', outputLoc, outputLocFlipped);
	// console.log('*** ' + flopCall);
	syscall(flopCall);
	
	var coordfile = fs.readFileSync(sourceDir + imageName.slice(0, -4) + '.txt', 'utf8');
	var coordlines = coordfile.split('\n');
	var coords = coordlines[0].split(' ');
	var direc = coordlines[1].split(' ')

	var flippedCoords = [0, 0];
	var flippedDir = [0, 0];
	flippedCoords[1] = coords[1];
	flippedCoords[0] = String(1 - parseFloat(coords[0]));
	flippedDir[1] = direc[1];
	flippedDir[0] = String(-parseFloat(direc[0]));
	
	//Save normalized starting coordinate files to image.txt
	var coordStr = coords[0] + ' ' + coords[1] + '\n' + direc[0] + ' ' + direc[1];
	fs.writeFileSync(listDirPrefix + dir + '/' + imageName.slice(0, -4) + '.txt', coordStr);

	//Save normalized starting coordinate files to image_flipped.txt
	var flippedCoordStr = flippedCoords[0] + ' ' + flippedCoords[1] + '\n' + flippedDir[0] + ' ' + flippedDir[1];
	fs.writeFileSync(listDirPrefix + dir + '/' + imageName.slice(0, -4) + '_flipped.txt', flippedCoordStr);

}

//Iterate through each line of images.txt
for (var i = 0; i < images.length; i++) {
	var outputLoc = listDirPrefix + dir + '/' +images[i];
	var outputLocFlipped = listDirPrefix + dir + '/' + images[i].slice(0, -4) + '_flipped.png';
	var sourceLoc = sourceDir + images[i];	
	console.log(images[i]);
	saveDownsampledAndFlipped(images[i], sourceLoc, outputLoc, outputLocFlipped);
}
