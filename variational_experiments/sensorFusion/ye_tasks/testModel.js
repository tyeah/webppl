// Train neurally-guided model
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --testTraces=name: Trains on traces in gen_traces/name.txt
// * --testImages=name: Test on images in directory ye_data/name
// * --trainedModel=name: Load neural nets from saved_params/name.txt
//   [Optional] If omitted, will use the prior program
// * --numTraces=num: Trains on a random subset of num traces
//   [Optional] If omitted, will use all training traces

var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');
var lsysUtils = require('../ye_utils.js');
var nnarch = require('../ye_nnarch');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
    program: 'mnist',
    testTraces: 'test_1',
    testImages: 'test',
    trainedModel: 'cnn',
    numTraces: 1000
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var testTraces = opts.testTraces;
assert(testTraces, 'Must define --testTraces option');
var testImages = opts.testImages;
assert(testImages, 'Must define --testImages option');
var nnGuide;
if (opts.trainedModel) {
	var saved_params = __dirname + '/../ye_params';
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	nnGuide = nnarch.loadFromFile(paramfile);
}
var modelName = opts.trainedModel;
var numTraces = opts.numTraces;
console.log(opts);

var gen_traces = __dirname + '/../ye_data';
var filename = gen_traces + '/' + testTraces + '.txt';
var traces = utils.loadTraces(filename);

var testImages = __dirname + '/../ye_data/' + opts.testImages
var data = new lsysUtils.TargetImageDatabase(testImages);

var image = undefined;
var globalStore = {target: {tensor: undefined}};

var numSample = (numTraces && numTraces < traces.length)? numTraces: traces.length;
var numCorrect = 0;

var maxIndex = function(a) {
  var m = 0;
  for (var i = 0; i < a.length; i++) {
    if (a[i] > a[m]) {
      m = i;
    }
  }
  return m;
}

for (var i = 0; i < numSample; i++) {
  image = data.getTargetByIndex(i);
  globalStore.target.tensor = image.tensor;
  var predicts = nnGuide.predict(globalStore, modelName);
  var yhat = maxIndex(predicts);
  var y = traces[i][1];
  /*
  console.log('----------------------------');
  console.log(i, y, yhat);
  console.log(predicts);
  */
  numCorrect += (y == yhat);
}

console.log(numCorrect);
console.log(numSample);
console.log(numCorrect / numSample);
