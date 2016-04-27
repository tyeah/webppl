// Generate measurement data used to train or test
// Command line arguments:
// * --program=name: Runs the WebPPL program in ye_programs/name.wppl
// * --measures=name: measurement data in sensorFusionData/measures.txt
// * --trainedModel=name: Load neural nets from ye_params/name.txt
//   [Optional] If omitted, will use the prior program
// * --outputName=name: Writes output estimations to sensorFusionData/outputName.txt
//   [Optional] If omitted, will note save generated traces
// * --numSamples=num: Number of samples generated
//   [Optional] Defaults to 100

var utils = require('../../utils.js');
var ad = require.call(null, 'adnn/ad');
var fs = require.call(null, 'fs');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
    program: 'genSFData',
    numSamples: 100
	}
});

var program = opts.program;
assert(program, 'Must define --program option');
var outputName = opts.outputName;
assert(program, 'Must define --outputName option');
var numSamples = opts.numSamples;

var rootdir = __dirname + '/'; // here __dirname is where this js file locates
var file = rootdir + program + '.wppl';
var filename = rootdir + outputName + '.txt';
if (!fs.existsSync(filename)) {
  var dataset = '[No dataset]'
  fs.appendFileSync(filename, dataset);
  fs.appendFileSync(filename, '\n');
}

var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js

var mapTrace = undefined;
var g = rets.generate;
var numParticles = 1;
var numSamples = 200;
for (var i = 0; i < numSamples; i++) {
  utils.runwebppl(ParticleFilter, [g, numParticles], globalStore, '', function(s, ret) {
    fs.appendFileSync(filename, JSON.stringify([ret.finalStore.Y, ret.finalStore.Z, ret.finalStore.X]) + '\n');
  });
}
console.log("save to: " + filename);
