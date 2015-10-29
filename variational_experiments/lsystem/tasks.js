var fs = require('fs');
var present = require('present');
var utils = require('../utils.js');
var lsysUtils = require('./utils.js');
var particleHistoryUtils = require('./particleHistoryUtils.js');

var gen_traces = __dirname + '/gen_traces';
var processed_data = __dirname + '/processed_data';

var serverReponse = function(globalStore, generate, target, viewport) {
	var saveHistory = lsysUtils.deleteStoredImages;
	var nParticles = 300;
	globalStore.target = target;
	var particleHistory;
	utils.runwebppl(ParticleFilter, [generate, nParticles, true, saveHistory], globalStore, '', function(s, ret) {
		particleHistory = ret.particleHistory;
	});
	return {
		targetName: target.shortname,
		viewport: viewport,
		history: particleHistoryUtils.compress(particleHistory)
	};
}

var generateTrainingData = function(globalStore, generate, name, targetDB) {
	if (!fs.existsSync(gen_traces)) {
		fs.mkdirSync(gen_traces);
	}
	var filename = gen_traces + '/' + name + '.txt';
	var t0 = present();
	var counter = 1;
	while (true) {
		// Generate for a random target, recording the target index as the first
		//    random choice in the trace so that playback can work correctly.
		var targetIdx = Math.floor(Math.random() * targetDB.numTargets());
		globalStore.target = targetDB.getTargetByIndex(targetIdx);
		var MAPtrace;
		utils.runwebppl(ParticleFilter, [generate, 300], globalStore, '', function(s, ret) {
			MAPtrace = ret.MAPparticle.trace;
		});
		var outTrace = [targetIdx].concat(MAPtrace);
		fs.appendFileSync(filename, JSON.stringify(outTrace) + '\n');
		var t = present();
		var rate = counter / ((t - t0)/60000);
		console.log('Generated trace ' + counter + ' (curr avg rate: ' + rate + ' per min)');
		counter++;
	}
};

var processTrainingData = function(globalStore, generate, name, env) {
	var dataFileName = gen_traces + '/' + name + '.txt';
	var traces = utils.loadTraces(dataFileName);
	if (!fs.existsSync(processed_data)) {
		fs.mkdirSync(processed_data);
	}
	var dataSubdir = processed_data + '/' + name;
	if (!fs.existsSync(dataSubdir)) {
		fs.mkdirSync(dataSubdir);
	}
	var ProcessTrainingTrace = require('./ProcessTrainingTrace.js')(env);
	var imgHashes = {};
	var starti = 0;
	// var starti = 11495;
	// var hashes = fs.readFileSync(processed_data + '/' + name + '/img.txt').toString().split('\n');
	// for (var i = 0; i < hashes.length; i++) {
	// 	imgHashes[hashes[i]] = true;
	// }
	for (var i = starti; i < traces.length; i++) {
		var trace = traces[i];
		utils.runwebppl(ProcessTrainingTrace, [generate, trace, imgHashes, dataSubdir], globalStore);
		console.log('Processed trace ' + (i+1) + '/' + traces.length);
	}
}

// TODO: Update this to work with externally-trained networks
///////////////////////////////////////////////////////////////////////////////
// var compareVariationalToPrior = function(paramFile) {
// 	var present = { present: require.call(null, 'present') };	// For timing
// 	var util = require.call(null, 'util');
// 	var outfilename = targetName + '_comparison.csv';
// 	var outfile = fs.openSync('variational_experiments/lsystem/analysis/'+outfilename, 'w');
// 	fs.writeSync(outfile, 'isVariational,numParticles,sim,time,avgTime\n');
// 	var nReps = 100;
// 	map(function(isVariational) {
// 		console.log('isVariational = ' + isVariational);
// 		var genFn = makeProgram(isVariational);
// 		if (isVariational) Variational.loadParams(vparams, paramFile);
// 		repeat(10, function(np) {
// 			var nParticles = np + 1;
// 			console.log('  nParticles = ' + nParticles);
// 			var simsAndTimes = repeat(nReps, function(i) {
// 				console.log('    repetition ' + i);
// 				globalStore.target = targetDB.getTargetByIndex(randomInteger(targetDB.numTargets()));
// 				var t0 = present.present();
// 				var ret = ParticleFilter(genFn, nParticles).MAPparticle.value;
// 				var t1 = present.present();
// 				var time = t1 - t0;
// 				var sim = computeSim(ret);
// 				return [sim, time];
// 			});
// 			var times = map(function(st) { return st[1]; }, simsAndTimes);
// 			var avgTime = sum(times) / times.length;
// 			map(function(st) {
// 				fs.writeSync(outfile, util.format('%s,%d,%d,%d,%d\n',
// 					isVariational, nParticles, st[0], st[1], avgTime));
// 			}, simsAndTimes);
// 		});
// 	}, [false, true]);
// 	fs.closeSync(outfile);
// }

module.exports = {
	serverReponse: serverReponse,
	generateTrainingData: generateTrainingData,
	processTrainingData: processTrainingData
};



