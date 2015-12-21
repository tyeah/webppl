// Start up an instance of a server that allows interactive exploration of
//    program outputs.
// Command line arguments:
// * --port=number: To use the UI, point your browser at localhost:number
//   [Optional] Defaults to 8000
// * --target=name: Uses target image named 'name'
//   [Optional] Defaults to 'a'
// * --numParticles=number: Control how many SMC particles are used
//   [Optional] Defaults to 300
// * --trainedModel=name: Load neural nets from saved_params/name.txt
//   [Optional] If omitted, will use the prior program


var _ = require('underscore');
var http = require('http');
var assert = require('assert');
var fs = require('fs');
var present = require('present');
var utils = require('../../utils.js');
var webppl = require('../../../src/main.js');
var lsysUtils = require('../utils.js');
var particleHistoryUtils = require('../particleHistoryUtils.js');
var nnarch = require('../nnarch');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		port: 8000,
		// TODO: Make these eventually be controlled by the client UI?
		target: 'a',
		numParticles: 300
	}
});
var nnGuide;
if (opts.trainedModel) {
	var saved_params = __dirname + '/../saved_params';
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	nnGuide = nnarch.loadFromFile(paramfile);
}
console.log(opts);

function generateResult() {
	// Initialize
	console.log('   Compiling code...');
	var file = __dirname + '/../lsystem.wppl';
	var rootdir = __dirname + '/..';
	var rets = utils.execWebpplFileWithRoot(file, rootdir);
	var globalStore = rets.globalStore;
	var generate = opts.trainedModel ? rets.generateGuided : rets.generate;
	var targetDB = rets.targetDB;
	var viewport = rets.viewport;
	if (opts.trainedModel) {
		globalStore.nnGuide = nnGuide;
	}

	// Run
	console.log('   Running program...');
	var saveHistory = lsysUtils.deleteStoredImages;
	globalStore.target = targetDB.getTargetByName(opts.target);
	var particleHistory;
	var t0 = present();
	utils.runwebppl(ParticleFilter, [generate, opts.numParticles, true, saveHistory, true], globalStore, '', function(s, ret) {
		particleHistory = ret.particleHistory;
		var t1 = present();
		console.log('   (Time taken: ' + (t1-t0)/1000 + ')');
	});
	var result = {
		targetName: opts.target,
		viewport: viewport,
		history: particleHistoryUtils.compress(particleHistory)
	};

	// Finish
	return JSON.stringify(result);
}

function fetchAsset(path) {
	var filename = __dirname + '/..' + path;
	if (!fs.existsSync(filename)) {
		console.log('   Requested asset does not exist; ignoring.');
	} else {
		return fs.readFileSync(filename);
	}
}

function handleRequest(request, response) {
	console.log('Request received: ' + request.url);
	var respContents;
	if (request.url === '/generate') {
		console.log('   [Generating result]');
		respContents = generateResult();
	} else {
		console.log('   [Fetching static asset]');
		var path = request.url === '/' ? '/test_ui.html' : request.url;
		respContents = fetchAsset(path);
	}
	console.log('   Done.');
	response.end(respContents);
}


var server = http.createServer(handleRequest);

server.listen(opts.port, function(){
    console.log("Server listening on http://localhost:%s", opts.port);
});
