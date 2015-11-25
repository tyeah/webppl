// Evaluate the performance of particle filters using either the prior or a
//    trained guide program
// Command line arguments:
// * --trainedModel=name: Looks for saved_params/name.txt. Otherwise, uses
//      the prior.
// * --outputName=name: Writes output .csv to performance_eval/name.txt.
//   [Optional] Defaults to the value of --trainedModel, or 'prior' if there
//      trained model provided.
// * --targetName=name: Only tests on targets/training/name.png
//   [Optional] If omitted, will test on all target images


var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var utils = require('../../utils.js');
var nn = require('adnn/nn');
var util = require('util');
var present = require('present');
var lsysUtils = require('../utils.js');
var render = require('../render.js');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		numReps: 50,
		start: 1,
		end: 10,
		incr: 1
	}
});
var trainedModel = opts.trainedModel;
var outputName = opts.outputName || trainedModel || 'prior';
console.log(opts);


var saved_params = __dirname + '/../saved_params';
var performance_eval = __dirname + '/../performance_eval';
if (!fs.existsSync(performance_eval)) {
	fs.mkdirSync(performance_eval);
}


// Initialize
var file = __dirname + '/../lsystem.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var viewport = rets.viewport;
var targetDB = rets.targetDB;
var generate = trainedModel ? rets.generateGuided : rets.generate;
var neuralNets = rets.neuralNets;


// Load trained networks
if (trainedModel) {
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	var jsonNets = JSON.parse(fs.readFileSync(paramfile).toString());
	var trainedNets = _.mapObject(jsonNets, function(jn) {
		return nn.deserializeJSON(jn);
	});
	for (var name in neuralNets) {
		neuralNets[name] = undefined;
	}
	_.extend(neuralNets, trainedNets);
}


// Run evaluation, generate CSV
var outfilename = performance_eval + '/' + outputName + '.csv';
var outfile = fs.openSync(outfilename, 'w');
fs.writeSync(outfile, 'numParticles,sim,time,avgTime\n');
var img = new lsysUtils.ImageData2D();
for (var i = opts.start; i <= opts.end; i += opts.incr) {
	var np = i;
	console.log('  numParticles = ' + np);
	var times = [];
	var sims = [];
	var avgTime = 0;
	for (var j = 0; j < opts.numReps; j++) {
		console.log('    repetition ' + (j+1));
		if (opts.targetName) {
			globalStore.target = targetDB.getTargetByName(opts.targetName);
		} else {
			var targetIdx = Math.floor(Math.random() * targetDB.numTargets());
			globalStore.target = targetDB.getTargetByIndex(targetIdx);	
		}
		var t0 = present();
		var retval;
		utils.runwebppl(ParticleFilter, [generate, np], globalStore, '', function(s, ret) {
			retval = ret.MAPparticle.value;
		});
		var t1 = present();
		var time = (t1 - t0)/1000;
		render.render(globalStore.target.canvas, viewport, retval);
		img.loadFromCanvas(globalStore.target.canvas);
		var sim = lsysUtils.normalizedSimilarity(img , globalStore.target);
		times.push(time);
		sims.push(sim);
		avgTime += time;
	}
	avgTime /= opts.numReps;
	for (var j = 0; j < opts.numReps; j++) {
		var sim = sims[j];
		var time = times[j];
		fs.writeSync(outfile, util.format('%d,%d,%d,%d\n',
			np, sim, time, avgTime));
	}
}
fs.closeSync(outfile);



