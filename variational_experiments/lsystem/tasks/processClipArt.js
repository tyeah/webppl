/*
Replace all open clip art images in source directory with a background removed version.
*/


var fs = require('fs');
var assert = require('assert');
var Canvas = require('canvas');
var util = require('util');
var syscall = require('child_process').execSync;


//var listDirPrefix = __dirname + '/../targets/datasets/';
var sourceDir = __dirname + '/../targets/source_old/';

function saveConverted(imageName, sourceLoc, outputLoc) {
	// Save resized + flipped images
	//Remove transparent background
	syscall(util.format('convert %s -background white -alpha remove %s',
		sourceLoc, outputLoc)); //-background white -alpha remove 
}

//Get list of images in source
var filenames = fs.readdirSync(sourceDir);

//Iterate through each image
for (var i = 0; i < filenames.length; i++) {
	//If ending in 800px.png:
	var last = filenames[i].substr(filenames[i].length - 9);
	if (last == '800px.png') {
		console.log(filenames[i]);		
		var outputLoc = sourceDir + filenames[i].slice(0, -4) + '_whitened.png';
		var sourceLoc = sourceDir + filenames[i];	
		saveConverted(filenames[i], sourceLoc, outputLoc);
	}


}