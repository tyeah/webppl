// Use neurally-guided/nonneurally-guided model to generate estimations for X given measurement Y and Z
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --measures=name: measurement data in sensorFusionData/measures.txt
// * --trainedModel=name: Load neural nets from ye_params/name.txt
//   [Optional] If omitted, will use the prior program
// * --outputName=name: Writes output estimations to sensorFusionData/outputName.txt
//   [Optional] If omitted, will note save generated traces
// * --numParticles=number: Control how many SMC particles are used
//   [Optional] Defaults to 300
// * --numSamples=num: Number of samples generated
//   [Optional] Defaults to 1000
// * --random=true/false: If true, randomly choose measurement for which to generate traces
// * --measures=name: measures
//   [Optional] If omitted, will use sensorFusionData/measures.txt
// * --verbose

var utils = require('../../utils.js');
var fs = require('fs');
var nnarch = require('../ye_nnarch');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
  boolean: ["verbose"],
	default: {
    program: 'sensorFusion',
    measures: 'singleMeasure',
    trainingTraces: 'traces',
    random: false,
    verbose: false,
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var trainingTraces = opts.trainingTraces;
assert(trainingTraces, 'Must define --trainingTraces option');
var measures = opts.measures;
var outputName = opts.outputName;
var numParticles = opts.numParticles;
var numSamples = opts.numSamples;
if (opts.trainedModel) {
	var saved_params = __dirname + '/../ye_params';
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
  if (!numParticles) {
    numParticles = 10;
  }
  /*
  if (!outputName) {
    outputName = 'tracesGuided';
  }
  */
} else {
  if (!numParticles) {
    numParticles = 1000;
  }
  /*
  if (!outputName) {
    outputName = 'traces';
  }
  */
}
var random = opts.random;
var verbose = opts.verbose;
console.log(opts);


var rootdir = __dirname + '/..'; // here __dirname is where this js file locates
var file = rootdir + '/ye_programs/sensorFusion.wppl';
var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js

var filename = rootdir + '/sensorFusionData/' + measures + '.txt';
var measures = utils.loadTraces(filename);
globalStore.measures = measures;
if (!numSamples) {
  numSamples = measures.length;
}

//opts = {trainedModel: 'sensorFusionArch'};
var g = opts.trainedModel ? rets.generateGuided : rets.generate;

var nnGuide;
if (opts.trainedModel) {
	nnGuide = nnarch.loadFromFile(paramfile);
	globalStore.nnGuide = nnGuide;
}

if (outputName) {
  var traceFile = rootdir + '/sensorFusionData/' + outputName + '.txt';
  //console.log(traceFile);
  if (!fs.existsSync(traceFile)) {
    var dataset = '[No dataset]'
    fs.appendFileSync(traceFile, dataset);
    fs.appendFileSync(traceFile, '\n');
  }
}
if (opts.savePost) {
  var savePost = rootdir + '/sensorFusionData/post/' + opts.savePost + '.csv';
  if (!fs.existsSync(savePost)) {
    var title = 'numParticles,logpost,timeUsed'
    fs.appendFileSync(savePost, title);
    fs.appendFileSync(savePost, '\n');
  }
}

var mapTrace = undefined;
var MAPlogpost = undefined;
var MAPInMAPIdx = 0;
var MAPInMAPlogpost = -1000;
var avgMAPlogpost = 0;
var startTime = Date.now();
for (var i = 0; i < numSamples; i++) {
  if (random) {
    var measureIndex = Math.floor(Math.random() * measures.length);
  } else {
    var measureIndex = i % measures.length;
  }
  globalStore.measure = measures[measureIndex];
  utils.runwebppl(ParticleFilter, [g, numParticles], globalStore, '', function(s, ret) {
    //console.log(Object.keys(s));//s is globalStore
    //console.log(Object.keys(ret));//ret is the ERP got by Enumerate(g)
    //console.log(ret.MAPparticle.weight);
    MAPlogpost = ret.MAPparticle.logpost;
    avgMAPlogpost += MAPlogpost;
    if (MAPInMAPlogpost < MAPlogpost) {
      MAPInMAPlogpost = MAPlogpost;
      MAPInMAPIdx = i;
    }
    //console.log(ret.support());
    mapTrace = [measureIndex].concat(ret.MAPparticle.trace);
  });
  if (!outputName) {
    if (verbose){
      console.log("flight " + i + ", logpost: " + MAPlogpost);
      console.log(mapTrace);
    }
  } else {
    if (verbose){
      console.log("flight " + i + ", measure " + measureIndex + ", logpost: " + MAPlogpost);
    }
    fs.appendFileSync(traceFile, JSON.stringify(mapTrace) + '\n');
  }
}

avgMAPlogpost /= numSamples;
var endTime = Date.now();
var timeUsed = (endTime - startTime);
console.log("MAP in MAP flight " + MAPInMAPIdx);
console.log("MAP in MAP logpost: " + MAPInMAPlogpost);
console.log("average MAP logpost: " + avgMAPlogpost);
if (traceFile) {
  console.log('save to ' + traceFile);
}
if (savePost) {
  fs.appendFileSync(savePost, numParticles + ',' + avgMAPlogpost + ',' + timeUsed + '\n');
}
