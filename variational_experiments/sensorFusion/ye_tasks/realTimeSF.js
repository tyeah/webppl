// Use neurally-guided/nonneurally-guided model to generate estimations for X given measurement Y and Z
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --measures=name: measurement data in sensorFusionData/measures.txt
// * --trainedModel=name: Load neural nets from ye_params/name.txt
//   [Optional] If omitted, will use the prior program
// * --outputName=name: Writes output estimations to sensorFusionData/outputName.txt
//   [Optional] If omitted, will not save generated traces
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
var readline = require('readline');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
  boolean: ["verbose"],
	default: {
    program: 'realTimeSF',
    random: false,
    verbose: false,
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var measures = opts.measures;
measures = measures ? fs.createReadStream('sensorFusionData/' + measures + '.txt') : process.stdin;
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

function verboseLog(verbose, content) {
  if (verbose) {
    console.log(content);
  }
}
verboseLog(verbose, opts);

var rl = readline.createInterface({
  //input: process.stdin,
  //input: fs.createReadStream('sensorFusionData/testMeasuresRT.txt'),
  input: measures,
  output: process.stdout,
  terminal: false
});

var rootdir = __dirname + '/..'; // here __dirname is where this js file locates
var file = rootdir + '/ye_programs/' + opts.program + '.wppl';
var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js

/*
var filename = rootdir + '/sensorFusionData/' + measures + '.txt';
var measures = utils.loadTraces(filename);
globalStore.measures = measures;
if (!numSamples) {
  numSamples = measures.length;
}
*/

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
var MAPlogpostAcc = 0;
var MAPInMAPIdx = 0;
var MAPInMAPlogpost = -1000;
var avgMAPlogpost = 0;
var measureLength = 0;
var numMeasures = 0;
var startTime = Date.now();
var curMeasure = undefined;
var estX = undefined;
var Xtrace = [];

var startX = [0, 0];
globalStore.prevX = startX;

var ppt = 'input measurements [[Y1,Y2],[Z1,Z2]], restart ot terminate:';
verboseLog(verbose, ppt);
rl.on('line', function(line) {
  if (line == 'terminate') {
    numMeasures += 1;
    avgMAPlogpost += (MAPlogpostAcc / measureLength);
    avgMAPlogpost /= numMeasures;
    var endTime = Date.now();
    console.log('average MAP log pose: ' + avgMAPlogpost);
    console.log('time: ' + (endTime - startTime));
    rl.close();
  } else if (line == 'restart') {
    globalStore.prevX = startX;
    numMeasures += 1;
    avgMAPlogpost += (MAPlogpostAcc / measureLength);
    measureLength = 0;
    MAPlogpostAcc = 0;
    verboseLog(verbose, ppt);
  } else {
    curMeasure = JSON.parse(line);
    globalStore.curY = curMeasure[0];
    globalStore.curZ = curMeasure[1];

    utils.runwebppl(ParticleFilter, [g, numParticles], globalStore, '', function(s, ret) {
      MAPlogpost = ret.MAPparticle.logpost;
      MAPlogpostAcc += MAPlogpost;
      estX = ret.MAPparticle.trace[0];
      globalStore.prevX = estX;
      Xtrace.push(estX);
      verboseLog(verbose, estX);
      verboseLog(verbose, 'MAPlogpost: ' + MAPlogpost);
      measureLength += 1;
      
      //console.log(ret.MAPparticle.weight);
      /*
      MAPlogpost = ret.MAPparticle.logpost;
      avgMAPlogpost += MAPlogpost;
      if (MAPInMAPlogpost < MAPlogpost) {
        MAPInMAPlogpost = MAPlogpost;
        MAPInMAPIdx = i;
      }
      //console.log(ret.support());
      mapTrace = [measureIndex].concat(ret.MAPparticle.trace);
      console.log(mapTrace)
      console.log(MAPlogpost);
      */
    });
    verboseLog(verbose, ppt);
  }
});
