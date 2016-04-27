var utils = require('../../utils.js');
var fs = require('fs');

var rootdir = __dirname + '/..'; // here __dirname is where this js file locates
var file = rootdir + '/ye_programs/sensorFusion.wppl';
var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js

var filename = rootdir + '/sensorFusionData/measures.txt';
var measures = utils.loadTraces(filename);

globalStore.measures = measures;

var traceFile = rootdir + '/sensorFusionData/traces.txt';
if (!fs.existsSync(traceFile)) {
  var dataset = '[No dataset]'
  fs.appendFileSync(traceFile, dataset);
  fs.appendFileSync(traceFile, '\n');
}

var mapTrace = undefined;
var g = rets.generate;
var numParticles = 1000;
var numSamples = 100;
for (var i = 0; i < numSamples; i++) {
  var measureIndex = Math.floor(Math.random() * measures.length);
  globalStore.measure = measures[measureIndex];
  utils.runwebppl(ParticleFilter, [g, numParticles], globalStore, '', function(s, ret) {
    //console.log(Object.keys(s));//s is globalStore
    //console.log(Object.keys(ret));//ret is the ERP got by Enumerate(g)
    //console.log(ret.MAPparticle.trace);
    //console.log(ret.support());
    mapTrace = [measureIndex].concat(ret.MAPparticle.trace);
  });
  console.log(mapTrace);
  fs.appendFileSync(traceFile, JSON.stringify(mapTrace) + '\n');
}
