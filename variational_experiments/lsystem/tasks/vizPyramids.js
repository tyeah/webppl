// Save images of some target/gen pyramids for a run of a program
// Command line arguments:
// --trainedModel=name: which trained model to use, looks in saved_params/name.txt
// --targetName=name: which target to use, looks in targets/training/name.png
// --outputName=name: where to write results in pyramid_viz/name/
//  [Optional] If omitted, uses 'test'


var fs = require('fs');
var utils = require('../../utils.js');
var lsysUtils = require('../utils.js');
var nnarch = require('../nnarch');


// Parse options
var opts = require('minimist')(process.argv.slice(2));
var trainedModel = opts.trainedModel;
assert(trainedModel, 'Must define --trainedModel option');
var targetName = opts.targetName;
assert(targetName, 'Must define --targetName option');
var outputName = opts.outputName || 'test';
console.log(opts);


// Ensure dirs exist
var saved_params = __dirname + '/../saved_params';
var pyramid_viz = __dirname + '/../pyramid_viz';
if (!fs.existsSync(pyramid_viz)) {
	fs.mkdirSync(pyramid_viz);
}
var outdir = pyramid_viz + '/' + outputName;
if (!fs.existsSync(outdir)) {
	fs.mkdirSync(outdir);
}


// Initialize webppl stuff
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generateGuided = rets.generateGuided;
var targetDB = rets.targetDB;


// Load trained model
globalStore.nnGuide = nnarch.loadFromFile(saved_params + '/' + opts.trainedModel + '.txt');


// Subroutine for saving pyramids to images
function savePyramid(pyramid, name) {
	for (var i = 0; i < pyramid.length; i++) {
		var level = pyramid[i];
		var img = new lsysUtils.ImageData2D().fromTensor(level);
		img.saveToFile(outdir + '/' + name + '_level' + i + '.png');
	}
}


// Run program once on requested target, save pyramids to images
globalStore.target = targetDB.getTargetByName(opts.targetName);
utils.runwebppl(ParticleFilter, [generateGuided, 1], globalStore, '', function(s, retDist) {
	var finalStore = retDist.finalStore;
	if (finalStore.pyramid) {
		savePyramid(finalStore.pyramid, 'target');
	}
	if (finalStore.imageSoFarPyramid) {
		savePyramid(finalStore.imageSoFarPyramid, 'gen');
	}
});