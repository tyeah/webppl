
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